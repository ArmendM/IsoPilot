# Marke in IsoPilot einbauen

Die Dateien und die Farben stehen in `LIESMICH.txt`, so wie sie mit dem
Logo geliefert wurden, und `VORSCHAU.png` zeigt jede Fassung auf dem
Grund, für den sie gedacht ist. Hier steht nur, was für IsoPilot
dazukommt. Nichts davon wiederholt die LIESMICH.

## Wo welche Datei im Code liegt

| Stelle im Code | Datei |
|---|---|
| Berichtskopf im PDF | `wortmarke/isoteam-wortmarke-farbig-2000.png` |
| `src/app/icon.svg` | Kopie von `icon/isoteam-favicon.svg` |
| `src/app/apple-icon.png` | Kopie von `icon/isoteam-appicon-180.png` |
| `src/app/favicon.ico` | aus `icon/isoteam-favicon-16.png` und `-32.png` zusammengesetzt |

## Drei Dinge, die beim Einbauen schiefgehen

**Ins PDF geht die PNG, nicht die SVG.** pdfkit kennt nur PNG und JPEG
und wirft bei einer SVG „Unknown image format", nachgeprüft mit beiden
Dateien. Deshalb liegt neben jeder Wortmarke eine PNG mit 2000 Pixel
Breite.

**Die Symbole in `src/app` sind Kopien, keine Verweise.** Next erkennt
`favicon.ico`, `icon.svg` und `apple-icon.png` an Ort und Namen und setzt
die `<link>`-Zeilen selbst. Ein Verweis auf `public` genügt dafür nicht.
Wer hier etwas ändert, ändert beide Stellen.

**Die Symbole gehören in die Ausnahmeliste in `src/proxy.ts`.** Sie
stehen im Kopf jeder Seite, also auch im Kopf der Anmeldeseite. Ohne
Ausnahme holt der Browser sie ohne Sitzung nicht, bekommt die
Anmeldeseite als Antwort und zeigt ein leeres Symbol, bevor sich
überhaupt jemand angemeldet hat.

## Noch nicht umgesetzt

Die LIESMICH nennt **Archivo ExtraBold** für die Wortmarke, dort in
Kurven umgewandelt, und **Barlow** für Begleittexte, beide über Google
Fonts. Die Oberfläche benutzt heute die Schriften aus `create-next-app`.
Das anzugleichen ist ein eigener Entscheid, nicht Teil des Ablegens der
Dateien: eine eingebundene Schrift kostet Ladezeit, und auf der Baustelle
zählt, dass die Seite schnell da ist.

Ebenfalls offen: der Upload eines eigenen Logos unter
`Company.logoPath`, das ist M4d. Solange dort nichts steht, nimmt der
Berichtskopf die Wortmarke aus diesem Verzeichnis.
