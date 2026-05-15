const games = readNumberFlag("--games", 100);

console.log(`Game simulation stub. Requested games: ${games}.`);

function readNumberFlag(flag: string, fallback: number) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}
