# IsoTeam Markenhandbuch

Verbindliche Grundlage fuer Logo, Farben und Schrift von Isoteam Suljejmani GmbH.
Gilt fuer Drucksachen, Fahrzeuge, Kleidung und fuer alles, was IsoPilot ausgibt
(Offerten, Rechnungen, Rapporte, App-Icon, Favicon).

Stand: 14. September 2026. Gewaehlte Richtung: "Signet O".

## Die Marke in einem Satz

Die Wortmarke lautet ISOTEAM in Versalien. Das O ist keine Schrift, sondern ein
senkrecht geteilter Ring: der Rohrquerschnitt, links kuehl und rechts warm. Es
gibt keine zweite Bildmarke daneben, der Ring allein ist das Signet.

## Konstruktion

Basis ist Archivo ExtraBold (Google Fonts, Gewicht 800), in Kurven umgewandelt.
Alle Werte in Schrifteinheiten bei 1000 Einheiten pro Geviert, Versalhoehe 686.

| Groesse | Wert | Begruendung |
|---|---|---|
| Ring aussen | 716 Einheiten Durchmesser | Archivos O misst 720 x 711, der Ring sitzt also auf Versalhoehe plus Ueberschuss |
| Strichstaerke | 165 Einheiten monolinear | Archivos O ist seitlich 184 und oben 140 stark, 165 ergibt dieselbe Farbmenge |
| Fuge | 96 Einheiten, senkrechter Schnitt | radial geschnitten liefen die Kanten auseinander |
| Kerning O zu T | -28 Einheiten | aus der Schrift uebernommen, ist in den Pfaden bereits enthalten |

Kompakte Fassung fuer kleine Groessen (ab 32 Pixel abwaerts): Strichstaerke 205,
Fuge 176, Ring fuellt 80 Prozent der Kachel. Ohne sie laeuft der Ring zu.

## Farben

| Name | Hex | Verwendung |
|---|---|---|
| Tiefblau | `#0A4A7C` | Wortmarke, Icon-Kachel, Linien im Briefkopf |
| Blau | `#0F6FB8` | Flaechen und Zustaende in IsoPilot, nicht im Logo selbst |
| Rot (Waerme) | `#D0342A` | nur die rechte Ringhaelfte |
| Anthrazit | `#131C24` | Text, Einfarbfassung |
| Papier | `#F5F6F7` | heller Grund |

Wichtig: Rot und Tiefblau haben fast dieselbe Helligkeit. Auf blauem Grund darum
immer die komplett weisse Fassung verwenden, nie die mit rotem Halbring.

## Schrift

- Wortmarke und Titel: **Archivo**, Gewicht 800
- Fliesstext, Adressen, Tabellen: **Barlow**, Gewicht 400 und 500
- Beide kostenlos ueber Google Fonts, auch kommerziell

## Fassungen und wann welche

| Fassung | Grund |
|---|---|
| farbig (Tiefblau + Rot) | heller Grund |
| negativ rot (Weiss + Rot) | dunkler, neutraler Grund |
| negativ weiss (alles Weiss) | blauer Grund, Stickerei, Gravur |
| schwarz (Anthrazit) | Einfarbdruck, Stempel |

## SVG zum Einbauen

Die Wortmarke braucht keine installierte Schrift, die Buchstaben sind Kurven.

### Wortmarke

```html
<svg viewBox="75 -699 4692 711" role="img" aria-label="IsoTeam">
  <path d="M75 0V-687H254V0Z M689 12Q624 12 567.0 0.5Q510 -11 466.5 -37.0Q423 -63 398.0 -105.5Q373 -148 373 -210Q373 -214 373.0 -219.0Q373 -224 374 -227H547Q547 -224 546.5 -219.5Q546 -215 546 -212Q546 -180 562.5 -160.5Q579 -141 609.0 -132.5Q639 -124 679 -124Q701 -124 720.0 -126.0Q739 -128 754.0 -133.0Q769 -138 780.5 -145.5Q792 -153 797.5 -163.5Q803 -174 803 -188Q803 -211 785.5 -226.0Q768 -241 738.5 -251.0Q709 -261 672.0 -270.0Q635 -279 595.0 -289.0Q555 -299 518.0 -314.0Q481 -329 451.5 -352.0Q422 -375 404.5 -409.5Q387 -444 387 -493Q387 -547 410.0 -586.5Q433 -626 473.5 -651.0Q514 -676 567.0 -687.5Q620 -699 680 -699Q739 -699 790.5 -687.0Q842 -675 882.0 -649.5Q922 -624 944.5 -585.5Q967 -547 968 -493V-481H796V-488Q796 -511 783.5 -528.5Q771 -546 746.0 -556.5Q721 -567 684 -567Q647 -567 621.5 -560.0Q596 -553 582.5 -540.0Q569 -527 569 -509Q569 -487 586.5 -473.0Q604 -459 634.0 -449.0Q664 -439 701.0 -430.5Q738 -422 777.5 -412.5Q817 -403 854.0 -388.5Q891 -374 921.0 -351.5Q951 -329 968.5 -296.0Q986 -263 986 -216Q986 -134 947.5 -84.0Q909 -34 841.5 -11.0Q774 12 689 12Z M2055 0V-540H1832V-687H2457V-540H2234V0Z M2560 0V-687H3127V-547H2739V-418H3078V-281H2739V-140H3134V0Z M3190 0 3448 -687H3663L3921 0H3730L3689 -119H3415L3374 0ZM3458 -253H3645L3596 -398Q3592 -409 3586.5 -425.5Q3581 -442 3575.5 -460.5Q3570 -479 3565.0 -498.0Q3560 -517 3555 -531H3548Q3544 -512 3536.5 -488.0Q3529 -464 3521.5 -440.0Q3514 -416 3508 -398Z M4003 0V-687H4264L4347 -381Q4352 -365 4359.0 -337.5Q4366 -310 4373.0 -280.0Q4380 -250 4385 -226H4393Q4397 -245 4403.0 -271.5Q4409 -298 4416.0 -327.5Q4423 -357 4429 -382L4513 -687H4767V0H4593V-293Q4593 -336 4593.5 -380.0Q4594 -424 4595.0 -460.0Q4596 -496 4596 -512H4588Q4585 -497 4578.5 -468.5Q4572 -440 4564.5 -409.5Q4557 -379 4551 -357L4451 0H4307L4206 -357Q4201 -377 4194.0 -405.0Q4187 -433 4180.5 -462.0Q4174 -491 4169 -511H4161Q4162 -485 4163.0 -447.5Q4164 -410 4165.0 -369.5Q4166 -329 4166 -293V0Z" fill="#0A4A7C"/>
  <path d="M 1383.00 -698.27 A 358 358 0 0 0 1383.00 11.27 L 1383.00 -156.56 A 193 193 0 0 1 1383.00 -530.44 Z" fill="#0A4A7C"/>
  <path d="M 1479.00 -698.27 A 358 358 0 0 1 1479.00 11.27 L 1479.00 -156.56 A 193 193 0 0 0 1479.00 -530.44 Z" fill="#D0342A"/>
</svg>
```

Fuer die Negativfassung alle `#0A4A7C` durch `#FFFFFF` ersetzen, fuer die
einfarbige Fassung zusaetzlich das Rot durch dieselbe Farbe.

### Signet allein

```html
<svg viewBox="-380 -380 760 760" role="img" aria-label="IsoTeam">
  <path d="M -48.00 -354.77 A 358 358 0 0 0 -48.00 354.77 L -48.00 186.94 A 193 193 0 0 1 -48.00 -186.94 Z" fill="#0A4A7C"/>
  <path d="M 48.00 -354.77 A 358 358 0 0 1 48.00 354.77 L 48.00 186.94 A 193 193 0 0 0 48.00 -186.94 Z" fill="#D0342A"/>
</svg>
```

### Kachel fuer App-Icon und Favicon

Kachel 1120 x 1120, Eckradius 262. Ring zentriert auf (560, 560).
App-Icon: Ring bei 64 Prozent Kachelbreite, also `scale(1.0011)`.
Favicon: kompakte Ringpfade bei 80 Prozent, also `scale(1.2514)`.

```html
<svg viewBox="0 0 1120 1120">
  <rect width="1120" height="1120" rx="262" fill="#0A4A7C"/>
  <g transform="translate(560 560) scale(1.0011)">
    <path d="M -48.00 -354.77 A 358 358 0 0 0 -48.00 354.77 L -48.00 186.94 A 193 193 0 0 1 -48.00 -186.94 Z" fill="#FFFFFF"/>
    <path d="M 48.00 -354.77 A 358 358 0 0 1 48.00 354.77 L 48.00 186.94 A 193 193 0 0 0 48.00 -186.94 Z" fill="#D0342A"/>
  </g>
</svg>
```

Kompakte Ringpfade fuer das Favicon:

```
links:  M -88.00 -347.02 A 358 358 0 0 0 -88.00 347.02 L -88.00 125.16 A 153 153 0 0 1 -88.00 -125.16 Z
rechts: M 88.00 -347.02 A 358 358 0 0 1 88.00 347.02 L 88.00 125.16 A 153 153 0 0 0 88.00 -125.16 Z
```

### React-Komponente fuer IsoPilot

```tsx
type Variant = "farbig" | "negativ" | "einfarbig";

export function IsoTeamLogo({ height = 32, variant = "farbig" as Variant }) {
  const ink = variant === "farbig" ? "#0A4A7C" : variant === "negativ" ? "#FFFFFF" : "currentColor";
  const warm = variant === "einfarbig" ? ink : "#D0342A";
  return (
    <svg viewBox="75 -699 4692 711" height={height} role="img" aria-label="IsoTeam">
      <path d="M75 0V-687H254V0Z M689 12Q624 12 567.0 0.5Q510 -11 466.5 -37.0Q423 -63 398.0 -105.5Q373 -148 373 -210Q373 -214 373.0 -219.0Q373 -224 374 -227H547Q547 -224 546.5 -219.5Q546 -215 546 -212Q546 -180 562.5 -160.5Q579 -141 609.0 -132.5Q639 -124 679 -124Q701 -124 720.0 -126.0Q739 -128 754.0 -133.0Q769 -138 780.5 -145.5Q792 -153 797.5 -163.5Q803 -174 803 -188Q803 -211 785.5 -226.0Q768 -241 738.5 -251.0Q709 -261 672.0 -270.0Q635 -279 595.0 -289.0Q555 -299 518.0 -314.0Q481 -329 451.5 -352.0Q422 -375 404.5 -409.5Q387 -444 387 -493Q387 -547 410.0 -586.5Q433 -626 473.5 -651.0Q514 -676 567.0 -687.5Q620 -699 680 -699Q739 -699 790.5 -687.0Q842 -675 882.0 -649.5Q922 -624 944.5 -585.5Q967 -547 968 -493V-481H796V-488Q796 -511 783.5 -528.5Q771 -546 746.0 -556.5Q721 -567 684 -567Q647 -567 621.5 -560.0Q596 -553 582.5 -540.0Q569 -527 569 -509Q569 -487 586.5 -473.0Q604 -459 634.0 -449.0Q664 -439 701.0 -430.5Q738 -422 777.5 -412.5Q817 -403 854.0 -388.5Q891 -374 921.0 -351.5Q951 -329 968.5 -296.0Q986 -263 986 -216Q986 -134 947.5 -84.0Q909 -34 841.5 -11.0Q774 12 689 12Z M2055 0V-540H1832V-687H2457V-540H2234V0Z M2560 0V-687H3127V-547H2739V-418H3078V-281H2739V-140H3134V0Z M3190 0 3448 -687H3663L3921 0H3730L3689 -119H3415L3374 0ZM3458 -253H3645L3596 -398Q3592 -409 3586.5 -425.5Q3581 -442 3575.5 -460.5Q3570 -479 3565.0 -498.0Q3560 -517 3555 -531H3548Q3544 -512 3536.5 -488.0Q3529 -464 3521.5 -440.0Q3514 -416 3508 -398Z M4003 0V-687H4264L4347 -381Q4352 -365 4359.0 -337.5Q4366 -310 4373.0 -280.0Q4380 -250 4385 -226H4393Q4397 -245 4403.0 -271.5Q4409 -298 4416.0 -327.5Q4423 -357 4429 -382L4513 -687H4767V0H4593V-293Q4593 -336 4593.5 -380.0Q4594 -424 4595.0 -460.0Q4596 -496 4596 -512H4588Q4585 -497 4578.5 -468.5Q4572 -440 4564.5 -409.5Q4557 -379 4551 -357L4451 0H4307L4206 -357Q4201 -377 4194.0 -405.0Q4187 -433 4180.5 -462.0Q4174 -491 4169 -511H4161Q4162 -485 4163.0 -447.5Q4164 -410 4165.0 -369.5Q4166 -329 4166 -293V0Z" fill={ink} />
      <path d="M 1383.00 -698.27 A 358 358 0 0 0 1383.00 11.27 L 1383.00 -156.56 A 193 193 0 0 1 1383.00 -530.44 Z" fill={ink} />
      <path d="M 1479.00 -698.27 A 358 358 0 0 1 1479.00 11.27 L 1479.00 -156.56 A 193 193 0 0 0 1479.00 -530.44 Z" fill={warm} />
    </svg>
  );
}
```

Seitenverhaeltnis der Wortmarke: 6.599 zu 1. Bei `height={32}` ist sie 211 Pixel breit.

## Schutzraum und Mindestgroesse

- Schutzraum rundum: mindestens die halbe Versalhoehe, also 343 Einheiten
- Wortmarke im Druck: nicht unter 18 Millimeter Breite
- Wortmarke am Bildschirm: nicht unter 90 Pixel Breite
- Signet: ab 32 Pixel abwaerts die kompakte Fassung

## Firmendaten fuer Kopf und Fuss

```
Isoteam Suljejmani GmbH
Gerliswilstrasse 68
6020 Emmenbruecke

E-Mail    info@isoteam-suljejmani.ch
Telefon   079 616 89 75 / 076 574 25 82
UID/MWST  CHE-305.978.601
Bank      Raiffeisenbank Emmenbruecke
IBAN      CH57 8080 8009 7723 8862 6

Leistungszeile: Waerme . Kaelte . Lueftungsisolationen . Brandschutz
Zahlungskonditionen: 10 Tage 2% Skonto / 30 Tage netto
```

## Aufbau Briefkopf A4

- Seitenrand 18 Millimeter links und rechts, 16 Millimeter oben
- Wortmarke oben links, Hoehe 40 Pixel bei 96 dpi, also rund 10.6 Millimeter
- Firmenadresse oben rechts, rechtsbuendig, Barlow 14 Pixel
- Trennlinie 2 Pixel in Tiefblau, darunter die Leistungszeile in Versalien
- Fusszeile dreispaltig: Adresse, Kontakt, UID und Bank
- Zahlungskonditionen und IBAN gehoeren auf den Rechnungsfuss, nicht auf den Briefkopf

Die fertigen Dateien (SVG und PNG in allen Fassungen, dazu ein Vorschaublatt)
wurden separat als Paket abgegeben.

## Dokumentvorlagen

Vier A4-Vorlagen liegen als druckfertiges HTML vor (Geschaeftsbrief, Offerte,
Rechnung mit Swiss QR-Zahlteil, Baustellenrapport), dazu eine Word-Vorlage und
ein Vordruck-PDF fuer eine Druckerei.

- Satzspiegel 170 Millimeter, Raender 20 Millimeter seitlich
- Adressfeld fuer Couvert C5/C6 mit Fenster rechts: links 115 mm, oben 45 mm.
  Fuer Fenster links auf 20 mm setzen
- Rendern mit Puppeteer oder Playwright, `printBackground: true`
- Der Zahlteil belegt die unteren 105 Millimeter, Empfangsschein 62 mm,
  Zahlteil 148 mm, Schriften dort Helvetica oder Arial nach Vorgabe

### QR-Rechnung

Fuer den Produktivbetrieb die npm-Bibliothek `swissqrbill` verwenden statt den
Zahlteil selbst zu bauen. Die erste echte Rechnung einmal ueber das offizielle
Validierungsportal pruefen.

Die IBAN CH57 8080 8009 7723 8862 6 ist eine **normale IBAN, keine QR-IBAN**
(Institutsnummer 80808 liegt ausserhalb 30000 bis 31999). Erlaubte
Referenzarten sind darum nur **NON** oder **SCOR**, nicht QRR. Die
Rechnungsnummer gehoert in das Feld "Zusaetzliche Informationen".

MWST-Satz Schweiz: 8.1 Prozent Normalsatz.
