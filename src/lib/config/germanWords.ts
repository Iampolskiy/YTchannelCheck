/**
 * German word list for language detection.
 * A channel is considered German if it contains >= minDistinct of these words.
 */
export const GERMAN_WORDS: ReadonlySet<string> = new Set([
  // Basic pronouns and articles
  "ich", "ist", "nicht", "sie", "du", "das", "die", "es", "und", "der",
  "zu", "ein", "in", "wir", "mir", "mit", "was", "den", "mich", "auf",
  "dass", "er", "eine", "hat", "so", "sind", "von", "dich", "war", "haben",
  "für", "ja", "hier", "an", "habe", "bin", "wie", "noch", "dir", "uns",
  "sich", "nur", "einen", "nein", "dem", "ihn", "auch", "hast", "sein", "ihr",
  "da", "aus", "kann", "aber", "schon", "wenn", "wird", "um", "als", "bist",
  "im", "mal", "doch", "gut", "meine", "jetzt", "weiß", "werden", "nach", "oh",
  "oder", "dann", "will", "mein", "mehr", "keine", "etwas", "alles", "muss", "immer",
  "nichts", "man", "wieder", "bei", "hab", "machen", "vor", "mann", "ihm", "einem",
  "tun", "zum", "können", "sagen", "werde", "denn", "warum", "einer", "gehen", "sehen",
  "sehr", "geht", "alle", "über", "müssen", "diese", "einfach", "euch", "kommt", "komm",
  "wollen", "also", "bitte", "na", "frau", "okay", "danke", "wer", "zeit", "ganz",
  "wirklich", "leben", "wäre", "gar", "darf", "heute", "wirst", "vielleicht", "könnte", "lassen",
  "hätte", "dort", "diesen", "tag", "soll", "gibt", "arbeit", "kommst", "weil", "sag",
  "los", "ihre", "dein", "deine", "eure", "unsere", "seine", "ihren", "deinen", "meinen",
  "deinem", "meinem", "meiner", "deiner", "ihrem", "unserem", "seinem", "ihres", "meines", "deines",
  "seiner", "unserer", "eurer", "eures", "unseres", "seinen",
  
  // Question words
  "wen", "wem", "wessen", "wo", "wohin", "woher", "wann", "wieso", "weshalb",
  
  // Adverbs and connectors
  "davor", "danach", "darum", "dabei", "dadurch", "dafür", "damit", "dagegen", "dazu",
  "darin", "darauf", "daraus", "daran", "dazwischen", "darunter", "darüber", "drin", "drauf",
  "drüber", "drunter", "dran", "draußen", "drinnen", "oben", "unten", "links", "rechts",
  "vorn", "vorne", "hinten", "dahin", "hierhin", "daher", "hierher", "genau", "bestimmt",
  "klar", "natürlich", "eigentlich", "eben", "halt", "tja", "naja", "hm", "hmm", "aha",
  "hey", "hi", "hallo", "tschüss", "ciao", "entschuldigung", "sorry",
  
  // Adjectives
  "schlecht", "richtig", "falsch", "genug", "weniger", "viel", "wenig", "jeder", "jede",
  "jedes", "kein", "keinen", "keinem", "keiner", "keines", "anderen", "andere", "anderes",
  "anderer", "anders", "irgendwas", "irgendwie", "irgendwo", "irgendwann", "jemand", "niemand",
  "niemanden", "sowas", "sonst", "nie", "manchmal", "oft", "selten", "gestern", "morgen",
  "bald", "gleich", "später", "früher", "sofort", "erst", "weiter", "zurück", "kurz",
  "lange", "damals", "gerade", "fast", "etwa", "ungefähr", "mindestens", "höchstens",
  "sicher", "unsicher", "möglich", "unmöglich", "wahr", "besser", "best", "schön", "hässlich",
  "groß", "klein", "kleiner", "größer", "alt", "neu", "jung", "stark", "schwach", "wichtig",
  "egal", "böse", "nett", "lieb", "fies", "dumm", "klug", "schlau", "komisch", "lustig",
  "witzig", "ernst", "ruhig", "laut", "leise", "schnell", "langsam", "schwer", "leicht",
  "hungrig", "durstig", "müde", "wach", "krank", "gesund", "warm", "kalt", "heiß",
  "süß", "salzig", "sauer", "bitter", "voll", "leer", "fertig", "bereit", "kaputt",
  
  // Common verbs
  "kommen", "kam", "kamen", "ging", "gingen", "geh", "gehst", "sehe", "siehst", "sieht",
  "sah", "sahen", "gesehen", "wissen", "weißt", "wusste", "wussten", "gesagt", "sage",
  "sagst", "sagt", "sagte", "sagten", "mache", "machst", "macht", "machte", "machten",
  "gemacht", "hatte", "hatten", "gehabt", "waren", "gewesen", "wurde", "wurden",
  "kannst", "könnt", "konnte", "konnten", "musst", "müsst", "musste", "mussten",
  "dürfen", "darfst", "dürft", "durfte", "durften", "sollen", "sollst", "sollt", "sollte",
  "sollten", "willst", "wollt", "wollte", "wollten", "mögen", "mag", "magst", "mögt",
  "mochte", "mochten", "brauchen", "brauch", "brauchst", "braucht", "gab", "gaben",
  "gegeben", "nehmen", "nimmt", "nahm", "nahmen", "genommen", "bringen", "bring",
  "bringst", "bringt", "brachte", "brachten", "lass", "lässt", "ließ", "finden", "finde",
  "findest", "findet", "fand", "fanden", "gefunden", "halten", "halte", "hält", "hielt",
  "hielten", "gehalten", "stehen", "stehe", "steht", "stand", "standen", "sitzen", "sitze",
  "sitzt", "saß", "saßen", "gesessen", "liegen", "liege", "liegt", "lag", "lagen",
  "gelegen", "laufen", "lauf", "läufst", "läuft", "lief", "liefen", "gelaufen", "fahren",
  "fahre", "fährst", "fährt", "fuhr", "fuhren", "gefahren", "fliegen", "fliege", "fliegst",
  "fliegt", "flog", "flogen", "geflogen", "arbeiten", "arbeite", "arbeitest", "arbeitet",
  "lerne", "lernst", "lernt", "gelernt", "lernen", "denken", "gedanken", "fühlen", "fühle",
  "fühlst", "fühlt", "reden", "rede", "redest", "redet", "fragen", "frage", "fragst",
  "fragt", "antwort", "antworten", "hören", "höre", "hörst", "hört", "spielen", "spiele",
  "spielst", "spielt", "gewinnen", "gewinnt", "gewonnen", "verlieren", "verliert", "verloren",
  "schlafen", "schlafe", "schläfst", "schläft", "wachen", "wacht", "aufwachen", "essen",
  "esse", "isst", "aß", "aßen", "gegessen", "trinken", "trinke", "trinkst", "trinkt",
  "trank", "tranken", "getrunken", "bezahlen", "bezahlt", "kaufen", "kauft", "verkaufen",
  "verkauft", "schreiben", "schreibt", "lesen", "liest", "glauben", "glaubst", "glaubt",
  "verstehen", "verstehe", "verstehst", "versteht", "verstanden", "kennen", "kenne",
  "kennst", "kennt", "kannten", "gekannt", "lieben", "liebe", "liebst", "liebt", "helfen",
  "helfe", "hilfst", "hilft", "half", "halfen", "geholfen", "warten", "warte", "wartest",
  "wartet", "bleiben", "bleib", "bleibst", "bleibt", "blieb", "blieben", "geblieben",
  "sterben", "starb", "gestorben", "retten", "gerettet", "schlagen", "schlägt", "schlug",
  "geschlagen", "kriegt"
]);

