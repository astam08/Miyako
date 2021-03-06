const EventEmitter = require("events");
const WebSocket = require("ws");

module.exports = class LavalinkBase extends EventEmitter {
  constructor(client, options = {}) {
    super();
    this.client = client;
    this.shards = options.shard || 1;
    this.host = options.host || "localhost";
    this.port = process.env.LAVALINK || options.port || 80;
    this.APIport = options.APIport || 2333;

    this.ws = new WebSocket(`ws://${this.host}:${this.port}`, {
      headers: {
        "User-Id": process.env.CLIENT_ID,
        "Num-Shards": this.shards,
        "Authorization": options.password || "youshallnotpass"
      }
    });
    this.ws.on("message", this._message.bind(this));
    this.ws.on("error", this._error.bind(this));
    this.ws.on("close", this._close.bind(this));

    this.client.on("raw", packet => {
      if (packet.t === "VOICE_SERVER_UPDATE") this._sendVoiceUpdate(packet.d); // Intercept these packets and send them to Lavalink instead.
    });
  }

  send(obj) {
    if (!this.ws) return this._error(new Error(`No Lavalink player found!`));
    if (!isNaN(obj.op)) {
      this.client.ws.send(obj); // If it is a number, then send it to client ws.
    } else {
      this.ws.send(JSON.stringify(obj), err => { // Send it to Lavalink.
        if (err) return console.error(err);
      });
    }

    if (this.client.wss) {
      obj.queue = this.client.guilds.get(obj.guildId) ? this.client.guilds.get(obj.guildId).player ? this.client.guilds.get(obj.guildId).player.queue : [] : [];
      return this.client.wss.send(JSON.stringify(obj));
    }
  }

  _message(msg) {
    const data = JSON.parse(msg);

    if (data.op === "stats") return this.stats = data;

    if (!this.client.guilds.has(data.guildId)) return;

    const guild = this.client.guilds.get(data.guildId);

    if (data.reason === "REPLACED") return;
    if (data.reason === "FINISHED") return this.emit("finished", guild);

    // If anything bad happens to the current track, emitting the "finished" event will cause the bot to skip the song.
    if (data.reason === "LOAD_FAILED") return this.emit("finished", guild);
    if (data.type === "TrackStuckEvent" || data.type === "TrackExceptionEvent") return this.emit("finished", guild);
  }

  _close() {
    if (!this.ws) return;

    this.ws.close();
    this.ws = null;
  }

  _error(err) {
    this._close();
    return this.emit("error", err);
  }

  _sendVoiceUpdate(packet) {
    if (!this.client.guilds.has(packet.guild_id)) return;

    const guild = this.client.guilds.get(packet.guild_id);

    return this.send({
      "op": "voiceUpdate",
      "guildId": packet.guild_id,
      "sessionId": guild.me.voice.sessionID,
      "event": packet
    });
  }
};