import { Chess } from "chess.js";
import { analyzeTacticalMotifs } from "../src/utils/tacticsMotifEngine";

console.log("Building pure Pirc Defense lines...");

// 1. PIN:
// 1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Nf3
const cPin = new Chess();
["e4", "d6", "d4", "Nf6", "Nc3", "g6", "Nf3"].forEach(m => cPin.move(m));
console.log("Pin (4... Bg4):", analyzeTacticalMotifs(cPin.fen(), ["Bg4", "Be2", "Bxf3"], "Pin")?.primaryMotif);

// 2. DISCOVERED ATTACK:
// 1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Nf3 Bg7 5. Be3 O-O 6. Qd2 c6 7. O-O-O
const cDisc = new Chess();
["e4", "d6", "d4", "Nf6", "Nc3", "g6", "Nf3", "Bg7", "Be3", "O-O", "Qd2", "c6"].forEach(m => cDisc.move(m));
// White plays 8. Bh6, Black plays 8... Nxe4 9. Nxe4 Bxh6
cDisc.move("Bh6");
console.log("Discovered Attack (8... Nxe4):", analyzeTacticalMotifs(cDisc.fen(), ["Nxe4", "Bxg7", "Nxd2"], "Discovered Attack")?.primaryMotif);

// 3. REMOVAL OF THE DEFENDER:
// 1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Nf3 Bg4 5. Be2 Nc6 6. Be3 e5
const cRem = new Chess();
["e4", "d6", "d4", "Nf6", "Nc3", "g6", "Nf3", "Bg4", "Be2", "Nc6", "Be3", "e5", "d5"].forEach(m => cRem.move(m));
console.log("Removal of Defender (7... Bxf3):", analyzeTacticalMotifs(cRem.fen(), ["Bxf3", "Bxf3", "Nd4"], "Removal of the Defender")?.primaryMotif);

// 4. INTERMEZZO:
// White captures 8. dxe5, Black plays intermediate 8... Qa5+
const cZw = new Chess();
["e4", "d6", "d4", "Nf6", "Nc3", "g6", "Nf3", "Bg7", "Be2", "O-O", "O-O", "e5", "dxe5", "dxe5"].forEach(m => cZw.move(m));
console.log("Zwischenzug fen valid:", cZw.fen());
