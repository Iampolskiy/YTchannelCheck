Du bist Cursor (AI Coding Agent) in meinem Node.js/Express/MongoDB Projekt „youTubeChannelCheck 2“ (Windows). Bitte implementiere folgende Änderungen sauber und modular, ohne die bestehende Logik kaputt zu machen.

ZIEL
Ich möchte eine neue „KI-Prüfung“ (Brand-Safety / Werbe-Eignung für mein Unternehmen Formilo), die YouTube-Kanäle anhand ihrer gespeicherten Daten bewertet und sie je nach Ergebnis in MongoDB Collections einsortiert:
- Wenn der Kanal für Formilo-Werbung geeignet ist → in Collection "positiv"
- Wenn nicht geeignet → in Collection "negativ"
Wichtig: Die Collection ist das Ergebnis. Nicht „positiv/negativ“ als Text irgendwo, sondern das Dokument soll in der passenden Collection gespeichert werden (inkl. aller Kanal-Daten).

WICHTIGE ANFORDERUNGEN
1) Refactor: KI-Prüfung aus server.js auslagern
- server.js ist bereits sehr groß. Die komplette KI-Logik (API Call, Prompt laden, Mehrheitsentscheidung, Job-Runner) soll in eigene Dateien unter z.B. lib/aiDecision/ ausgelagert werden.
- In server.js soll nur die Route bleiben, die einen Job startet und dann die ausgelagerte Funktion aufruft.

2) Bis zu drei KI-Modelle (1–3) + Mehrheitsentscheidung
- Es gibt 3 Modell-Slots: MODEL_1, MODEL_2, MODEL_3.
- Jeder definierte Slot wird aufgerufen und liefert "positiv" oder "negativ" + kurze Begründung.
- Modell-Slots, die leer sind, werden NICHT aufgerufen.
- Die Prüfung läuft mit genau der Anzahl definierter Modelle (1, 2 oder 3).

Mehrheitsregel:
- Bei 3 Modellen: 2 von 3 entscheidet (Mehrheit gewinnt).
- Bei 2 Modellen: wenn beide gleich sind → das ist das Ergebnis; wenn 1:1 unentschieden → entscheide Safety-first "negativ".
- Bei 1 Modell: dessen Entscheidung ist das Ergebnis (wenn unsicher → Safety-first "negativ", da das Modell das so bewerten soll).

3) Modelle müssen leicht austauschbar sein
- Die Modelnamen sollen „oben im Code“ leicht zu ändern sein (z.B. Default-Konfiguration), aber auch vom Frontend übergeben werden können.
- Wenn keine Modelnamen gesetzt sind, darf der Server nicht crashen – er soll den Job sauber abbrechen (Status failed oder done mit Hinweis) und nichts speichern.

4) Frontend: index.html anpassen
- In public/index.html existiert bereits ein Button „Start Prozess 2 (ungefiltert → vorgefiltertCode)“.
- Darunter soll ein KI-Button existieren: „Start KI Prüfung (vorgefiltertCode → positiv/negativ)“.
- Zusätzlich sollen dort 3 Input-Felder hinzugefügt werden, damit ich Model 1/2/3 im Browser einstellen kann (Textfelder).
- Beim Klick auf den KI-Button soll der Browser an den Server posten:
  {
    "model1": "...",
    "model2": "...",
    "model3": "...",
    "limit": 0,
    "dryRun": false
  }
- Die Ausgabe soll wie bei den anderen Jobs über das bestehende Job/SSE Live-Log System laufen.

5) Datenquelle für KI-Prüfung
- Die KI-Prüfung soll über die Collection "vorgefiltertCode" iterieren (das sind bereits gefilterte Kanäle).
- Pro Kanal: Prompt mit Kanal-Daten bauen (kompakt, z.B. Title/Description/Keywords und eine begrenzte Anzahl Video-Titel).
- Danach die Modell-Abfragen (für alle definierten Modelle) durchführen und die Mehrheitsentscheidung bilden.

6) Speichern in MongoDB
- Zwei neue Collections/Models existieren/ sollen existieren: "positiv" und "negativ".
- Pro Kanal soll der komplette Datensatz (Snapshot) gespeichert werden, plus ein Feld, das die Einzelurteile (pro Modell) und die finale Mehrheitsentscheidung dokumentiert (für Nachvollziehbarkeit).
- Optional: Wenn ein Kanal in positiv landet und vorher in negativ war (oder umgekehrt), darfst du die alte Version löschen oder updaten – Hauptsache am Ende ist es eindeutig einsortiert.

7) Collections UI
- Die Collections-Seite /collections nutzt /api/collections und /api/collection/:name.
- Ergänze positiv/negativ in /api/collections und in der Model-Auswahl, damit man die Collections im UI sehen kann.

8) Konfiguration / API Key / Endpoint
- Das Projekt nutzt aktuell KEIN dotenv. ENV Variablen werden über process.env gelesen.
- KI-API Call soll „OpenAI-kompatibel“ sein (chat completions).
- Nutze:
  - process.env.OPENAI_API_KEY für den Key
  - process.env.OPENAI_ENDPOINT optional (default https://api.openai.com/v1/chat/completions)
- Wenn OPENAI_API_KEY fehlt, soll der Job sauber scheitern mit verständlicher Fehlermeldung.

9) Prompt-Datei
- Lege eine Prompt-Datei an (z.B. lib/config/aiPrompt.de.txt), die klar vorgibt, dass die KI ausschließlich JSON zurückgeben darf:
  { "decision": "positiv"|"negativ", "reason": "..." }
- Prompt muss Brand-Safety/Ads-Eignung für Formilo erklären.

IMPLEMENTIERUNGS-HINWEISE
- Bitte nutze das bestehende Job-System (createJob, SSE logs, progress counters).
- Ergänze passende progress-counter für die KI-Prüfung (total/done/saved/errors).
- Schreibe den Code so, dass ich später sehr leicht andere Modelle eintragen kann.
- Bitte halte die Änderungen minimal-invasiv: bestehende Prozesse 1 und 2 dürfen nicht kaputt gehen.

LIEFERUMFANG
- Neue Dateien in lib/aiDecision/ (oder ähnlichem) + Anpassungen in server.js (nur import + route + minimal wiring)
- Anpassungen in public/index.html (3 Inputs + Button sendet die Models)
- Prompt-Datei
- Update /api/collections + getCollectionModelByName für positiv/negativ

Stelle bitte am Ende kurz dar:
- Welche Dateien geändert/neu sind
- Wie ich es starte/teste (inkl. benötigter ENV Variablen)

