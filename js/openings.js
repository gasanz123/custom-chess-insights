// openings.js - Compact ECO opening recognition database

const OPENINGS_DB = [
  // === Sicilian Variants ===
  { m: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', n: 'Sicilian Defense: Najdorf Variation', eco: 'B90' },
  { m: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6', n: 'Sicilian Defense: Dragon Variation', eco: 'B70' },
  { m: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6', n: 'Sicilian Defense: Classical Variation', eco: 'B56' },
  { m: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e5', n: 'Sicilian Defense: Sveshnikov', eco: 'B33' },
  { m: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4', n: 'Sicilian Defense: Open', eco: 'B32' },
  { m: 'e4 c5 Nf3 e6 d4 cxd4 Nxd4', n: 'Sicilian Defense: Taimanov', eco: 'B46' },
  { m: 'e4 c5 c3', n: 'Sicilian Defense: Alapin Variation', eco: 'B22' },
  { m: 'e4 c5 d4 cxd4 c3', n: 'Sicilian Defense: Smith-Morra Gambit', eco: 'B21' },
  { m: 'e4 c5 Nf3 d6 d4', n: 'Sicilian Defense: Open', eco: 'B50' },
  { m: 'e4 c5 Nf3', n: 'Sicilian Defense', eco: 'B20' },
  { m: 'e4 c5', n: 'Sicilian Defense', eco: 'B20' },

  // === Italian / Giuoco Piano ===
  { m: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3', n: 'Italian Game: Giuoco Piano', eco: 'C54' },
  { m: 'e4 e5 Nf3 Nc6 Bc4 Nf6', n: 'Italian Game: Two Knights Defense', eco: 'C55' },
  { m: 'e4 e5 Nf3 Nc6 Bc4', n: 'Italian Game', eco: 'C50' },

  // === Ruy Lopez ===
  { m: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7', n: 'Ruy Lopez: Closed Defense', eco: 'C84' },
  { m: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O', n: 'Ruy Lopez: Morphy Defense', eco: 'C78' },
  { m: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4', n: 'Ruy Lopez: Morphy Defense', eco: 'C77' },
  { m: 'e4 e5 Nf3 Nc6 Bb5 Nf6', n: 'Ruy Lopez: Berlin Defense', eco: 'C65' },
  { m: 'e4 e5 Nf3 Nc6 Bb5 a6', n: 'Ruy Lopez: Morphy Defense', eco: 'C70' },
  { m: 'e4 e5 Nf3 Nc6 Bb5', n: 'Ruy Lopez', eco: 'C60' },

  // === Scotch ===
  { m: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4', n: 'Scotch Game', eco: 'C45' },
  { m: 'e4 e5 Nf3 Nc6 d4', n: 'Scotch Game', eco: 'C44' },

  // === Petroff ===
  { m: 'e4 e5 Nf3 Nf6', n: "Petroff's Defense", eco: 'C42' },

  // === Philidor ===
  { m: 'e4 e5 Nf3 d6', n: 'Philidor Defense', eco: 'C41' },

  // === King's Gambit ===
  { m: 'e4 e5 f4 exf4', n: "King's Gambit Accepted", eco: 'C33' },
  { m: 'e4 e5 f4 d5', n: "King's Gambit: Falkbeer Counter-Gambit", eco: 'C31' },
  { m: 'e4 e5 f4', n: "King's Gambit", eco: 'C30' },

  // === Vienna ===
  { m: 'e4 e5 Nc3', n: 'Vienna Game', eco: 'C25' },

  // === Four Knights ===
  { m: 'e4 e5 Nf3 Nc6 Nc3 Nf6', n: 'Four Knights Game', eco: 'C47' },

  // === French ===
  { m: 'e4 e6 d4 d5 e5', n: 'French Defense: Advance Variation', eco: 'C02' },
  { m: 'e4 e6 d4 d5 exd5', n: 'French Defense: Exchange Variation', eco: 'C01' },
  { m: 'e4 e6 d4 d5 Nc3 Bb4', n: 'French Defense: Winawer Variation', eco: 'C15' },
  { m: 'e4 e6 d4 d5 Nc3 Nf6', n: 'French Defense: Classical Variation', eco: 'C11' },
  { m: 'e4 e6 d4 d5 Nd2', n: 'French Defense: Tarrasch Variation', eco: 'C03' },
  { m: 'e4 e6 d4 d5', n: 'French Defense', eco: 'C00' },
  { m: 'e4 e6', n: 'French Defense', eco: 'C00' },

  // === Caro-Kann ===
  { m: 'e4 c6 d4 d5 e5', n: 'Caro-Kann Defense: Advance Variation', eco: 'B12' },
  { m: 'e4 c6 d4 d5 exd5 cxd5', n: 'Caro-Kann Defense: Exchange Variation', eco: 'B13' },
  { m: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4', n: 'Caro-Kann Defense: Classical', eco: 'B18' },
  { m: 'e4 c6 d4 d5 f3', n: 'Caro-Kann Defense: Fantasy Variation', eco: 'B12' },
  { m: 'e4 c6 d4 d5', n: 'Caro-Kann Defense', eco: 'B10' },
  { m: 'e4 c6', n: 'Caro-Kann Defense', eco: 'B10' },

  // === Scandinavian ===
  { m: 'e4 d5 exd5 Qxd5', n: 'Scandinavian Defense', eco: 'B01' },
  { m: 'e4 d5 exd5 Nf6', n: 'Scandinavian Defense: Modern', eco: 'B01' },
  { m: 'e4 d5', n: 'Scandinavian Defense', eco: 'B01' },

  // === Pirc / Modern ===
  { m: 'e4 d6 d4 Nf6 Nc3 g6', n: 'Pirc Defense', eco: 'B07' },
  { m: 'e4 g6 d4 Bg7', n: 'Modern Defense', eco: 'B06' },
  { m: 'e4 d6', n: 'Pirc Defense', eco: 'B07' },

  // === Alekhine ===
  { m: 'e4 Nf6 e5 Nd5', n: "Alekhine's Defense", eco: 'B02' },
  { m: 'e4 Nf6', n: "Alekhine's Defense", eco: 'B02' },

  // === Open Game base ===
  { m: 'e4 e5 Nf3 Nc6', n: 'Open Game', eco: 'C44' },
  { m: 'e4 e5 Nf3', n: "King's Knight Opening", eco: 'C40' },
  { m: 'e4 e5', n: 'Open Game', eco: 'C20' },

  // === Queen's Gambit ===
  { m: 'd4 d5 c4 dxc4', n: "Queen's Gambit Accepted", eco: 'D20' },
  { m: 'd4 d5 c4 e6 Nc3 Nf6 Bg5', n: "Queen's Gambit Declined: Orthodox", eco: 'D60' },
  { m: 'd4 d5 c4 e6 Nc3 Nf6', n: "Queen's Gambit Declined", eco: 'D30' },
  { m: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4', n: 'Slav Defense: Czech Variation', eco: 'D17' },
  { m: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6', n: 'Semi-Slav Defense', eco: 'D43' },
  { m: 'd4 d5 c4 c6', n: 'Slav Defense', eco: 'D10' },
  { m: 'd4 d5 c4 e6', n: "Queen's Gambit Declined", eco: 'D30' },
  { m: 'd4 d5 c4', n: "Queen's Gambit", eco: 'D06' },

  // === King's Indian ===
  { m: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O', n: "King's Indian Defense: Classical", eco: 'E90' },
  { m: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3', n: "King's Indian Defense: Sämisch", eco: 'E80' },
  { m: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6', n: "King's Indian Defense", eco: 'E70' },
  { m: 'd4 Nf6 c4 g6 Nc3 Bg7', n: "King's Indian Defense", eco: 'E60' },
  { m: 'd4 Nf6 c4 g6', n: "King's Indian Defense", eco: 'E60' },

  // === Nimzo-Indian ===
  { m: 'd4 Nf6 c4 e6 Nc3 Bb4', n: 'Nimzo-Indian Defense', eco: 'E20' },

  // === Queen's Indian ===
  { m: 'd4 Nf6 c4 e6 Nf3 b6', n: "Queen's Indian Defense", eco: 'E15' },

  // === Catalan ===
  { m: 'd4 Nf6 c4 e6 g3', n: 'Catalan Opening', eco: 'E01' },
  { m: 'd4 d5 c4 e6 Nf3 Nf6 g3', n: 'Catalan Opening', eco: 'E01' },

  // === Grünfeld ===
  { m: 'd4 Nf6 c4 g6 Nc3 d5', n: 'Grünfeld Defense', eco: 'D80' },

  // === Benoni ===
  { m: 'd4 Nf6 c4 c5 d5 e6', n: 'Benoni Defense: Modern', eco: 'A60' },
  { m: 'd4 Nf6 c4 c5 d5', n: 'Benoni Defense', eco: 'A56' },

  // === Dutch ===
  { m: 'd4 f5', n: 'Dutch Defense', eco: 'A80' },

  // === London System ===
  { m: 'd4 Nf6 Bf4', n: 'London System', eco: 'D00' },
  { m: 'd4 d5 Bf4', n: 'London System', eco: 'D00' },

  // === Trompowsky ===
  { m: 'd4 Nf6 Bg5', n: 'Trompowsky Attack', eco: 'A45' },

  // === d4 base lines ===
  { m: 'd4 d5', n: "Queen's Pawn Game", eco: 'D00' },
  { m: 'd4 Nf6 c4 e6 Nf3', n: 'Indian Defense', eco: 'E10' },
  { m: 'd4 Nf6 c4', n: 'Indian Defense', eco: 'A50' },
  { m: 'd4 Nf6', n: 'Indian Defense', eco: 'A45' },
  { m: 'd4', n: "Queen's Pawn Opening", eco: 'A40' },

  // === English ===
  { m: 'c4 e5 Nc3 Nf6', n: 'English Opening: Four Knights', eco: 'A28' },
  { m: 'c4 e5', n: 'English Opening: Reversed Sicilian', eco: 'A20' },
  { m: 'c4 c5', n: 'English Opening: Symmetrical', eco: 'A30' },
  { m: 'c4 Nf6', n: 'English Opening', eco: 'A15' },
  { m: 'c4', n: 'English Opening', eco: 'A10' },

  // === Réti ===
  { m: 'Nf3 d5 c4', n: 'Réti Opening', eco: 'A09' },
  { m: 'Nf3 d5', n: 'Réti Opening', eco: 'A04' },
  { m: 'Nf3 Nf6', n: "King's Indian Attack", eco: 'A05' },
  { m: 'Nf3', n: 'Réti Opening', eco: 'A04' },

  // === Misc first moves ===
  { m: 'e4', n: "King's Pawn Opening", eco: 'B00' },
  { m: 'g3', n: "King's Fianchetto Opening", eco: 'A00' },
  { m: 'b3', n: "Larsen's Opening", eco: 'A01' },
  { m: 'f4', n: "Bird's Opening", eco: 'A02' },
];

function identifyOpening(sanMoves) {
  if (!sanMoves || sanMoves.length === 0) return { name: 'Starting Position', eco: '' };
  const movesStr = sanMoves.join(' ');
  let best = null;

  for (const entry of OPENINGS_DB) {
    if (movesStr === entry.m ||
        (movesStr.startsWith(entry.m) &&
         (movesStr.length === entry.m.length || movesStr[entry.m.length] === ' '))) {
      if (!best || entry.m.length > best.m.length) {
        best = entry;
      }
    }
  }

  return best ? { name: best.n, eco: best.eco } : { name: 'Unknown Opening', eco: '' };
}

window.identifyOpening = identifyOpening;
