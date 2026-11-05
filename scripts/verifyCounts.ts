import { PREPOPULATED_PIRC_TACTICS } from "../src/utils/prepopulatedTactics";

const motifCounts: Record<string, number> = {};
for (const p of PREPOPULATED_PIRC_TACTICS) {
  motifCounts[p.primaryMotif] = (motifCounts[p.primaryMotif] || 0) + 1;
}

console.log("Motif Counts (all 16 motifs):");
console.log(motifCounts);
console.log("Total puzzles in database:", PREPOPULATED_PIRC_TACTICS.length);

// Sample Level 1 checks
console.log("\nSample Level 1 Puzzles:");
console.log("Pin L1:", PREPOPULATED_PIRC_TACTICS.find(p => p.primaryMotif === "Pin" && p.tierLevel === 1)?.solutionPv);
console.log("Skewer L1:", PREPOPULATED_PIRC_TACTICS.find(p => p.primaryMotif === "Skewer" && p.tierLevel === 1)?.solutionPv);
console.log("Discovered Attack L1:", PREPOPULATED_PIRC_TACTICS.find(p => p.primaryMotif === "Discovered Attack" && p.tierLevel === 1)?.solutionPv);
console.log("Removal of Defender L1:", PREPOPULATED_PIRC_TACTICS.find(p => p.primaryMotif === "Removal of the Defender" && p.tierLevel === 1)?.solutionPv);
console.log("Fork / Double Attack L1:", PREPOPULATED_PIRC_TACTICS.find(p => p.primaryMotif === "Fork / Double Attack" && p.tierLevel === 1)?.solutionPv);
