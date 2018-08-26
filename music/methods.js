const Lavalink = require("../music/Lavalink");
const snekfetch = require("snekfetch");

module.exports = class extends Lavalink {
  constructor(...args) { super(...args); } // eslint-disable-line

  async getSong(query) {
    const res = await snekfetch.get(`http://${this.client.player.host}:${this.client.player.APIport}/loadtracks`)
      .query({ identifier: `ytsearch:${query}` })
      .set("Authorization", "youshallnotpass")
      .catch(error => ({
        "error": error
      }));

    if (res.error) return Promise.reject(res.error);
    if (!res) return Promise.reject(new Error(`I couldn't GET from http://${this.client.player.host}:${this.client.player.APIport}/loadtracks`));

    for (const track of res.body.tracks) {
      track.info.looped = false;
      track.info.loadType = res.body.loadType;
      track.info.playlistInfo = res.body.playlistInfo;
    }

    return Promise.resolve(res.body.tracks);
  }

  // Always get the highest quality thumbnail if possible
  async getThumbnail(videoId) {
    const res = await snekfetch.get(`https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet&key=${process.env.YT}`).catch(e => ({
      "error": e
    }));

    if (res.error) return `http://i3.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    if (res.body.items[0].snippet.thumbnails.maxres) return res.body.items[0].snippet.thumbnails.maxres.url;
    else return `http://i3.ytimg.com/vi/${videoId}/hqdefault.jpg`; // eslint-disable-line
  }

  play(guild, track, target) {
    guild.player.playing = true;
    guild.player.musicStart = new Date(); // when the song start I get the date when it starts
    guild.player.musicPauseAll = null; // this is only to make sure everything is back to default
    guild.player.musicPause = null; // this too
    guild.player.musicPlayTime = () => {
      // Here I look if there is something in musicPauseAll and if the music is currently paused
      if (guild.player.musicPauseAll && guild.player.musicPause) {
        // if it is then I do this insane math that I will write under
        // now = the time now but in miliseconds (                         same shit that is under in the parenthese)
        // start = miliseconds of the date when the music started (remember that it's from the date so it will be all miliseconds of all the time to this date)
        // all = miliseconds of all the time the music has been paused
        // pause = miliseconds of the date when the music got paused
        // so now here is the formula
        // (now - start) - (all + (now - pause))
        // well first we need to get the miliseconds of how much time from now and the pause variable since remember the pause is miliseconds from the date
        // so you do now - pause = miliseconds the music is currently paused for
        // after you add all to this since all is already the miliseconds of only the time it has been paused so we don't need to substract it to now (it's already done under in resume)
        // so now you got all the time it has been paused for
        // now you want the time it has been playing
        // so you do now - start = miliseconds the music should have been playing without any pausing include
        // so you only need to do the miliseconds of the play time - the pause time and voila
        // basically that's the steps how I said it  4. (3. now - start) - (2. all + (1. now - pause))
        // the 4 is actually the two brackets substracted I am pretty sure you get it ok this seemspretty understandable
        return ((new Date()).getTime() - guild.player.musicStart.getTime()) - (guild.player.musicPauseAll + ((new Date()).getTime() - guild.player.musicPause.getTime()));
      } else if (guild.player.musicPause) { // so this else if just checks whether it is paused?
        // well here you just don't add the all in this since it doesn't have anything ye aight
        // (now - start) - (now - pause)
        return ((new Date()).getTime() - guild.player.musicStart.getTime()) - ((new Date()).getTime() - guild.player.musicPause.getTime());
      } else if (guild.player.musicPauseAll) { // look if the music has been paused but is still playing currently
        // you do the same but without adding the now - pause since it's not currently paused
        // (now - start) - all
        return ((new Date()).getTime() - guild.player.musicStart.getTime()) - guild.player.musicPauseAll;
      } else { // eslint-disable-line
        // (now - start) - (all + (now - pause)
        return (new Date()).getTime() - guild.player.musicStart.getTime(); // here is when there was no pause
      }
    };

    guild.player.seekTime = time => {
      guild.player.musicStart = new Date((new Date()).getTime() - Number(time));
      if (guild.player.musicPause) guild.player.musicPause = new Date();
      guild.player.musicPauseAll = null;
    };

    setInterval(() => { // this onlly for testing
      console.log(guild.player.musicPlayTime());
    }, 10000);

    return this.send({
      "op": "play",
      "guildId": guild.id,
      "track": track
    }, target);
  }

  seek(guild, pos, target) {
    guild.player.seekTime(pos);

    return this.send({
      "op": "seek",
      "guildId": guild.id,
      "position": pos
    }, target);
  }

  skip(guild, target) {
    if (guild.player.queue.length >= 2) {
      guild.player.queue.shift();
      return this.play(guild, guild.player.queue[0].track, target);
    }
  }

  resume(guild, target) {
    this.send({
      "op": "pause",
      "guildId": guild.id,
      "pause": false
    }, target);

    // so here when it's resume I look if there is something in musicPauseAll since it's where all the paused miliseconds will go added together
    // with the math that you can is basically to get the miliseconds but not from the date but the duration
    // so what I do is the current date miliseconds - the miliseconds of the pause date and that gives you the time it has been paused in miliseconds
    // after I just add it to musicPauseAll or I set the value to the miliseconds of the pause if there is nothing in it
    if (guild.player.musicPauseAll) guild.player.musicPauseAll += ((new Date()).getTime() - guild.player.musicPause.getTime());
    else guild.player.musicPauseAll = (new Date()).getTime() - guild.player.musicPause.getTime();
    guild.player.musicPause = null; // this is an extremely important line since I make musicPause null again, and this is to know if the music is currently in pause or not if null == not paused if there is something the music is paused
    guild.player.paused = false;
    return guild.player.playing = true;
  }

  pause(guild, target) {
    this.send({
      "op": "pause",
      "guildId": guild.id,
      "pause": true
    }, target);

    // When pause is used I get the date of when the user paused the music
    guild.player.musicPause = new Date();
    guild.player.paused = true;
    return guild.player.playing = false;
  }

  volume(guild, vol, target) {
    this.send({
      "op": "volume",
      "guildId": guild.id,
      "volume": vol
    }, target);

    return guild.player.volume = parseInt(vol);
  }

  stop(guild, target) {
    this.send({
      "op": "stop",
      "guildId": guild.id
    }, target);

    guild.player.paused = false;
    return guild.player.playing = false;
  }

  destroy(guild, target) {
    this.emit("finished", guild);

    guild.player.queue = [];

    return this.send({
      "op": "destroy",
      "guildId": guild.id
    }, target);
  }

  leave(guild, target) {
    this.send({
      "op": 4,
      "shard": this.client.player.shards,
      "d": {
        "guild_id": guild.id,
        "channel_id": null,
        "self_mute": false,
        "self_deaf": false
      }
    }, target);

    guild.player.channelId = null;
    return guild.player.playing = false;
  }

  join(msg, target) {
    return this.send({
      "op": 4,
      "shard": this.client.player.shards,
      "d": {
        "guild_id": msg.guild.id,
        "channel_id": msg.member.voice.channel.id,
        "self_mute": false,
        "self_deaf": false
      }
    }, target);
  }
};