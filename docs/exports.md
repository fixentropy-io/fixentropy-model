# How the package expose its exports

## Exports

The package exposes the following exports:

- `./asserter`
- `./profiler`
- `./grapher`
- `./common`
- `./test-utils`

## Exports configuration

The package uses the `exports` field of the `package.json` file to configure the exports.

## How it works

The package uses the `exports` field to configure the exports.
Basically because the runtime engines on which the code is executed are different in some situations, the packages expose 2 different exports:

- The `bun` export, is used to specify to Bun that it must resolve typescript files in the package.
- The `import` export, is the actual package built that can be served to engines that don't natively support typescript.

## How to use it

In your package that uses the `@fixentropy-io/type` package, you must specify in the tsconfig.json file the following:

```json
{
    "compilerOptions": {
        // ...

        "customConditions": ["bun"]

        // ...
    }
}
```

**OR**

by extending the tsconfig.json file of the package:

```json
{
    "extends": "@fixentropy-io/type/tsconfig.bun",
}
```

This is required to inform typescript that it must resolve the typescript files in the package under a specific condition.

---

You can then import the package in your code like this:

```ts
import type { Dragee } from '@fixentropy-io/type/common'; // '@fixentropy-io/type/<export-name>'

const dragees: Dragee[] = [];
```
