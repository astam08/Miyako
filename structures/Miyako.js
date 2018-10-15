/* eslint no-undefined: 0 */
/* eslint no-use-before-define: 0 */

const { Client } = require("discord.js");
const chalk = require("chalk");
const WebSocket = require("ws");
const Lavalink = require("../music/methods");
require("./Structures")();

module.exports = class Miyako extends Client {
  constructor(options = {}) {
    super();
    Object.assign(this.options, options.clientOptions);

    Object.assign(this, {
      "events": {},
      "monitors": {},
      "inhibitors": {},
      "finalizers": {},
      "commands": {},
      "aliases": {},
      "tasks": {},
      "utils": {}
    });

    Object.assign(this, {
      "cache": {
        "client": new Map(),
        "users": new Map(),
        "guilds": new Map(),
        "members": new Map()
      },
      "categories": new Set(),
      "userCooldowns": new Set(),
      "player": new Lavalink(this),
      "wss": new WebSocket(process.env.WEBSOCKET, { "rejectUnauthorized": false })
    });

    Object.assign(this, {
      "owner": options.owner,
      "prefix": options.prefix,
      "messagesPerSecond": 0,
      "commandsPerSecond": 0
    });

    this.setInterval(() => {
      this.messagesPerSecond = 0;
      this.commandsPerSecond = 0;
    }, 1100);

    this.wss.on("open", this._wssOnOpen.bind(this));
    this.wss.on("error", this._wssOnError.bind(this));
    this.wss.on("message", this._handleRequests.bind(this)); // Bind the event listener to this method so that it can process the request.

    this.player.on("error", err => console.error(err));
    this.player.on("finished", this._playerFinish.bind(this));

    require("../loaders/loader")(this);
  }

  // Perform a check against all inhibitors before executing the command.
  runCmd(msg, cmd, args) {
    // TODO: Update author/member cache if needed below this line
    const inhibitors = Object.keys(this.inhibitors);

    if (inhibitors.length < 1) return cmdRun(this); // If there's no inhibitors, just run the command.

    let count = 0; // Keep track of the total inhibitors that allow the command to be passed though.

    for (const inhibitor of inhibitors) { // Loop through all loaded inhibitors.
      try {
        if (isNaN(count)) break; // If the inhibitor throws anything that is not a number, then the command should fail to execute.
        count += this.inhibitors[inhibitor](this, msg, cmd); // Inhibitors returns 1 if it doesn't fail or return any error.
      } catch (error) {
        break;
      }
    }

    // If all inhibitors return 1 and equals to the total number of inhibitor, run the command.
    if (count >= inhibitors.length) return cmdRun(this);

    function cmdRun(client) {
      cmd.run(msg, args);
      const finalizers = Object.keys(client.finalizers);
      if (finalizers.length < 1) return null;
      for (const finalizer of finalizers) client.finalizers[finalizer](client);
      return null;
    }
  }

  updateCache(data) {
    if (!this.cache[data.ns.coll].has(data.documentKey._id)) return;
    if (data.operationType === "delete" && data.documentKey._id !== process.env.CLIENT_ID) return this.cache[data.ns.coll].delete(data.documentKey._id); // Don't let it delete itself from cache
    if (data.operationType === "insert" || data.operationType === "replace") return this.cache[data.ns.coll].set(data.documentKey._id, data.fullDocument);
    if (data.operationType === "update") {
      const updated = data.updateDescription.updatedFields; // Object with newly added properties
      const removed = data.updateDescription.removedFields; // Array of removed property names
      const cache = this.cache[data.ns.coll].get(data.documentKey._id);

      if (Object.keys(removed).length > 0) {
        for (const prop of removed) {
          if (cache[prop] === process.env.CLIENT_ID) continue; // Don't allow it to delete database reference of itself
          else if (cache[prop]) delete cache[prop]; // If it has this property, then delete it.
        }
      }

      this.cache[data.ns.coll].set(data.documentKey._id, {
        ...cache,
        ...updated
      });
    }
  }

  get myCache() {
    return this.cache.client.get(process.env.CLIENT_ID);
  }

  /* Handle requests sent by the websocket server */
  _handleRequests(data) {
    const request = JSON.parse(data);
    const guild = request.id ? this.guilds.get(request.id) : request.guildId ? this.guilds.get(request.guildId) : false;

    if (request.event === "connection") return console.log(`${chalk.keyword("green")(`[${new Date(Date.now()).toLocaleString()}]`)} ${chalk.keyword("cyan")(`🔗  Connected ${chalk.green("successfully")} to the main websocket server! (${this.wss.url})`)}`);

    if (request.op && guild) {
      if (request.op === "pause") return this.player.pause(guild);
      else if (request.op === "seek" && request.pos) return this.player.seek(guild, request.pos);
      else if (request.op === "resume") return this.player.resume(guild);
      else if (request.op === "skip") return this.player.skip(guild);
      else if (request.op === "leave") return this.player.leave(guild);
      else if (request.op === "init") return this._playerInit(guild, request);
    }
  }

  _wssOnOpen() {
    this.wss.send(JSON.stringify({
      "op": "identify",
      "identifier": process.env.BOT_IDENTIFIER
    }));
  }

  _wssOnError(error) {
    this.wss = null;
    return console.error(error);
  }

  _playerInit(guild, request) {
    this.wss.send(JSON.stringify({
      ...request, // Merge the request object with this object.
      "queue": guild.player ? guild.player.queue ? guild.player.queue : [] : [],
      "track": guild.player ? guild.player.queue[0] ? guild.player.queue[0].info : false : false,
      "time": guild.player ? guild.player.musicPlayTime() : false
    }));
  }

  _playerFinish(guild) {
    if (guild.player && guild.player.queue[0] && !guild.player.queue[0].info.looped) guild.player.queue.shift();

    if (guild.player) {
      if (guild.player.queue.length > 0) {
        guild.player.musicStart = new Date();
        guild.player.musicPauseAll = null;
        guild.player.musicPause = null;

        this.player.send({
          "op": "play",
          "guildId": guild.id,
          "track": guild.player.queue[0].track
        });
      } else {
        guild.player.musicPause = new Date();
        guild.player.playing = false;

        if (this.wss) {
          this.wss.send(JSON.stringify({
            "op": "finished",
            "id": guild.id
          }));
        }
      }
    }
  }
};