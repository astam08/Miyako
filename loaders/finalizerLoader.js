module.exports = (client, fs) => {
  /* Load all command finalizers. */
  fs.readdir("./finalizers")
    .then(finalizers => finalizers.forEach(f => client.finalizers[f.slice(0, -3)] = require(`../finalizers/${f}`)))
    .catch(error => { throw error; });
};