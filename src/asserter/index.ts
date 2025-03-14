import { Glob } from 'bun';
import { type Dragee, generateId } from '../common';

export type ReportStats = {
    rulesCount: number;
    passCount: number;
    errorsCount: number;
};
export type RuleError = {
    ruleId?: string;
    message: string;
    drageeName: string;
};
export type Report = {
    pass: boolean;
    namespace: string;
    errors: RuleError[];
    stats: ReportStats;
};
export type SuccessfulRuleResult = {
    ruleId?: string;
    pass: true;
};
export type FailedRuleResult = {
    ruleId?: string;
    pass: false;
    error: RuleError;
};
export type RuleResult = SuccessfulRuleResult | FailedRuleResult;

export type Successful = () => SuccessfulRuleResult;

export type Failed = (dragee: Dragee, message: string) => FailedRuleResult;

export type AssertHandler = (asserter: Asserter, dragees: Dragee[]) => Report;

export const successful: Successful = () => {
    return { pass: true };
};

export const failed: Failed = (dragee: Dragee, message: string) => {
    return { pass: false, error: { drageeName: dragee.name, message } };
};

/**
 * Finds direct dependancies for a root dragee
 * @param root
 * @param allDragees
 * @returns
 */
export const directDependencies = (root: Dragee, allDragees: Dragee[]) => {
    if (!root.depends_on) {
        return { root, dependencies: [] };
    }

    const dependencies = Object.keys(root.depends_on)
        .map(dependency => allDragees.find(dragee => dragee.name === dependency))
        .filter((dragee): dragee is Dragee => dragee !== undefined);

    return { root, dependencies };
};

/**
 * This function scans the directory for rule files
 * @param dir the directory to scan
 * @returns an iterator of the files matching the rule pattern
 */
function scanRuleFiles(dir: string) {
    return new Glob('*.rule.ts').scanSync({
        cwd: dir,
        absolute: true,
        onlyFiles: true
    });
}

/**
 * Rules scanning in asserter directory
 * Adds a generated ID for every rule
 * @param namespace asserter namespace
 * @param dir scanned directory
 * @returns rules found in dir
 */
export const findRules = (namespace: string, dir: string): Rule[] => {
    const files = scanRuleFiles(dir);

    return Array.from(files)
        .map(file => require(file).default as DeclaredRule)
        .map(rule => declaredRuleToRule(namespace, rule));
};

export function findRule(namespace: string, dir: string, ruleName: string): Rule | undefined {
    const files = scanRuleFiles(dir);

    const file = Array.from(files).find((file) =>
      file.includes(`/${ruleName}`)
    );

    if (!file) {
        return undefined;
    }

    const rule = require(file).default;
    return declaredRuleToRule(namespace, rule);
}

export type Asserter = {
    readonly namespace: string;
    readonly rules: Rule[];
    rule: (file: string) => Rule | undefined;
};

/**
 * Tests dragees list against the asserter rules, and builds a result report
 * @param asserter Asserter including dragees rules
 * @param dragees Dragees to test against the asserter rules
 * @returns Report of dragees testing
 */
export const asserterHandler: AssertHandler = (asserter: Asserter, dragees: Dragee[]): Report => {
    const rulesResults = asserter.rules.flatMap(rule =>
        rule.handler(dragees).map(result => {
            result.ruleId = rule.id;
            return result;
        })
    );

    const rulesResultsErrors = rulesResults
        .filter((result): result is FailedRuleResult => !result.pass)
        .map(result => {
            result.error.ruleId = result.ruleId;
            return result.error;
        });

    const rulesResultsPassed = rulesResults.filter(
        (result): result is SuccessfulRuleResult => result.pass
    );

    return {
        pass: rulesResultsErrors.length === 0,
        namespace: asserter.namespace,
        errors: rulesResultsErrors,
        stats: {
            errorsCount: rulesResultsErrors.length,
            passCount: rulesResultsPassed.length,
            rulesCount: asserter.rules.length
        }
    };
};

/**
 * Tests dragees list against the rules of an asserter, and builds a result report
 * @param asserter Asserter including dragees rules
 * @param dragees Dragees to test against the asserter rules
 * @returns Report of dragees testing
 */
export function generateReportForRule(asserter: Asserter, dragees: Dragee[], file: string): Report {
    const rule = asserter.rule(file);

    if (!rule) {
        return {
            pass: true,
            namespace: asserter.namespace,
            errors: [],
            stats: {
                errorsCount: 0,
                passCount: 0,
                rulesCount: 0
            }
        };
    }

    const ruleResults = rule.handler(dragees).map(result => {
        result.ruleId = rule.id;
        return result;
    });

    const rulesResultsErrors = ruleResults
        .filter((result): result is FailedRuleResult => !result.pass)
        .map(result => {
            result.error.ruleId = result.ruleId;
            return result.error;
        });

    const rulesResultsPassed = ruleResults.filter(
        (result): result is SuccessfulRuleResult => result.pass
    );

    return {
        pass: rulesResultsErrors.length === 0,
        namespace: asserter.namespace,
        errors: rulesResultsErrors,
        stats: {
            errorsCount: rulesResultsErrors.length,
            passCount: rulesResultsPassed.length,
            rulesCount: asserter.rules.length
        }
    };
}

/**
 * Rule severity
 */
export enum RuleSeverity {
    ERROR = 'error',
    WARN = 'warn',
    INFO = 'info'
}

export type DeclaredRule = {
    readonly label: string;
    readonly severity: RuleSeverity;
    readonly handler: (dragees: Dragee[]) => RuleResult[];
};

export type Rule = DeclaredRule & { readonly id: string };

const declaredRuleToRule = (namespace: string, rule: DeclaredRule): Rule => {
    return { id: generateId(namespace, rule.label), ...rule };
};

/**
 * Expects a dragee to follow a unique dragee eval rule
 * @param root Tested dragee, used for the error report
 * @param dragee Assert dragee, parameter of eval function
 * @param errorMsg Error message
 * @param evalFn Eval function
 * @returns RuleResult success/fail
 */
export const expectDragee = (
    root: Dragee,
    dragee: Dragee,
    errorMsg: string,
    evalFn: (dragee: Dragee) => boolean
): RuleResult => (evalFn(dragee) ? successful() : failed(root, errorMsg));

/**
 * Expects multiple dependancies dragees to follow a multiple dragee eval rule
 * @param root Tested dragee, used for the error report
 * @param dragee Assert dragee, parameter of eval function
 * @param errorMsg Error message
 * @param evalFn Eval function
 * @returns RuleResult success/fail
 */
export const expectDragees = (
    root: Dragee,
    dependancies: Dragee[],
    errorMsg: string,
    evalFn: (dragees: Dragee[]) => boolean
): RuleResult => (evalFn(dependancies) ? successful() : failed(root, errorMsg));

/**
 * Expects multiple dragees to follow a unique dragee eval rule
 * @param root Tested dragee, used for the error report
 * @param dragee Assert dragee, parameter of eval function
 * @param errorMsg Error message
 * @param evalFn Eval function
 * @returns RuleResult success/fail
 */
export const multipleExpectDragees = (
    root: Dragee,
    dragees: Dragee[],
    errorMsg: string,
    evalFn: (dragee: Dragee) => boolean
): RuleResult[] => dragees.map(d => (evalFn(d) ? successful() : failed(root, errorMsg)));
