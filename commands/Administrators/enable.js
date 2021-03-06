const Command = require("../../modules/Base/Command");

module.exports = class extends Command {
  constructor(...args) {
    super(...args, {
      enabled: true,
      guarded: true,
      botOwnerOnly: false,
      nsfw: false,
      cooldown: 5,
      description: msg => `Enable already-disabled commands in ${msg.guild.name}`,
      usage: () => [`ping`],
      aliases: [],
      userPermissions: ["administrator"],
      botPermissions: [],
      runIn: ["text"]
    });
  }

  async run(msg, args) {
    if (!this.client.commands[args[0]] && !this.client.aliases[args[0]]) return msg.fail(`Please enter a valid command to be enabled!`);

    const data = msg.guild.cache;

    if (!data.disabledCommands) data.disabledCommands = [];
    // No need to check aliases, etc because if a command is disabled, it's parent name and aliases will be in this array.
    if (!data.disabledCommands.includes(args[0])) return msg.fail(`${msg.author.username}, "${args[0]}" is already enabled!`);

    const cmd = this.client.commands[args[0]] || this.client.commands[this.client.aliases[args[0]]];
    // Filter the array currently stored in the db, so that it does not contain the command aliases or the name
    const filteredCommands = data.disabledCommands.filter(command => !cmd.aliases.includes(command) && command !== args[0] && command !== cmd.name);

    try {
      await msg.guild.updateDatabase({ "disabledCommands": filteredCommands });
      return msg.success(`I have successfully enabled "${args[0]}"`);
    } catch (error) {
      return msg.error(error, "enable this command");
    }
  }
};