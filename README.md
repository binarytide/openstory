# Ode

[![version](https://img.shields.io/npm/v/ode?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/ode)
[![downloads](https://img.shields.io/npm/dt/ode.svg?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/ode)

## Install

```bash
npm install ode
```

## Usage

```ts
import { greet, add } from "ode";

greet("world"); // "Hello, world!"
add(1, 2); // 3
```

### Browser (IIFE)

```html
<script src="https://unpkg.com/ode/dist/index.iife.js"></script>
<script>
  Ode.greet("world"); // "Hello, world!"
</script>
```

## Development

This is a pnpm monorepo using [vite-plus](https://github.com/nicolo-ribaudo/vite-plus) for building and [changesets](https://github.com/changesets/changesets) for versioning.

### Setup

```bash
pnpm install
```

### Build

```bash
pnpm build
```

### Test

```bash
pnpm test
```

### Lint & Format

```bash
pnpm lint
pnpm format
```

### Release

```bash
pnpm changeset       # create a changeset
pnpm version         # bump versions
pnpm release         # build + publish
```

## Contributing

Pull requests are welcome! Please run `pnpm check` before submitting.

## License

MIT
