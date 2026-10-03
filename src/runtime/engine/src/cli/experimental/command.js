// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function valueOption(name, parse) {
  return { name, parse };
}
function stringOption(name) {
  return valueOption(name, (value) => ({ ok: true, value }));
}
class Command {
  name;
  options = /* @__PURE__ */ new Map();
  subcommands = /* @__PURE__ */ new Map();
  builder;
  commandAction;
  constructor(name) {
    this.name = name;
  }
  option(option) {
    if (this.options.has(option.name)) {
      throw new Error(`Option ${option.name} is already registered for ${this.name}`);
    }
    this.options.set(option.name, option);
    return this;
  }
  build(builder) {
    this.builder = builder;
    return this;
  }
  action(action) {
    this.commandAction = action;
    return this;
  }
  command(command) {
    if (this.subcommands.has(command.name)) throw new Error(`Command ${command.name} is already registered`);
    this.subcommands.set(command.name, {
      parse: (argv) => command.parse(argv),
      execute: (argv, context) => command.execute(argv, context)
    });
    return this;
  }
  parse(argv) {
    const selected = this.select(argv);
    if (selected) return selected.command.parse(selected.argv);
    return this.parseOwn(argv);
  }
  async execute(argv, context) {
    const selected = this.select(argv);
    if (selected) {
      return selected.command.execute(selected.argv, context);
    }
    const parsed = this.parseOwn(argv);
    if (!parsed.ok) return parsed;
    if (!this.commandAction) throw new Error(`Command ${this.name} does not define an action`);
    await this.commandAction(parsed.command, context);
    return { ok: true, command: parsed.command };
  }
  select(argv) {
    const candidate = argv[0];
    if (candidate === void 0) return void 0;
    const command = this.subcommands.get(candidate);
    return command ? { command, argv: argv.slice(1) } : void 0;
  }
  parseOwn(argv) {
    if (!this.builder) throw new Error(`Command ${this.name} does not define a builder`);
    const parsed = this.parseOptions(argv);
    const input = {
      remainingArgs: parsed.remainingArgs,
      value: (option) => parsed.values.get(option.name)?.[0],
      values: (option) => parsed.values.get(option.name) ?? []
    };
    const built = this.builder(input);
    const errors = [...parsed.errors, ...built.ok ? [] : built.errors];
    if (errors.length > 0) return { ok: false, errors };
    if (!built.ok) throw new Error(`Command ${this.name} failed without an error`);
    return { ok: true, command: built.command };
  }
  parseOptions(argv) {
    const parsed = {
      values: /* @__PURE__ */ new Map(),
      remainingArgs: [],
      errors: []
    };
    for (let index = 0; index < argv.length; index++) {
      const argument = argv[index];
      if (argument === "--") {
        parsed.remainingArgs.push(...argv.slice(index));
        break;
      }
      const equals = argument.indexOf("=");
      const name = equals === -1 ? argument : argument.slice(0, equals);
      const option = this.options.get(name);
      if (!option) {
        parsed.remainingArgs.push(...argv.slice(index));
        break;
      }
      let value = equals === -1 ? void 0 : argument.slice(equals + 1);
      if (value === void 0) {
        const next = argv[index + 1];
        if (next !== void 0 && !next.startsWith("-")) {
          value = next;
          index++;
        }
      }
      if (value === void 0 || value === "") {
        parsed.errors.push(`${name} requires a value`);
        continue;
      }
      const values = parsed.values.get(name) ?? [];
      if (values.length > 0) {
        parsed.errors.push(`${name} may only be specified once`);
        continue;
      }
      const result = option.parse(value);
      if (!result.ok) {
        parsed.errors.push(result.error);
        continue;
      }
      values.push(result.value);
      parsed.values.set(name, values);
    }
    return parsed;
  }
}
export {
  Command,
  stringOption,
  valueOption
};
