/** Voor ondertekende builds: fuses zetten tijdens afterPack, dus vóór het ondertekenen. Zie apply-fuses.js. */
module.exports = context => require('./apply-fuses').flip(context)
