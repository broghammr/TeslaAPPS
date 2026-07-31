Ziel:

* Eigene Website die über den Browser im Tesla Model 3 Highland aufgerufen werden kann



Anforderungen:

* UI: gute Ablesbarkeit während der Fahrt: hell, großer Kontrast und große Schriftarten, nur grautöne mit genau einer Akzentfarbe (Blau #0070f3)
* UI: Themen werden in Form von Kacheln dargestellt
* UI: Keine Titelleiste/ Kopfzeile oder ähnliches, nur Überschrift und dann die Kacheln für die Themen
* UI: Kacheln haben ein Icon, eine Überschrift und eine Unterüberschrift, sowie eine Statuszeile
* UI: Die Icons der Kacheln sind Piktogramme



Inhalt:

* Main Hub (index.html): Übersicht der Themen im "Kachel-Design"
* Themen: Hello World, FC Bayern München, Tesla, SpaceX, X Money



Architektur:





Deployment:

* Deployment über GitHub Pages
* Repo: https://github.com/broghammr/TeslaAPPS (öffentlich)
* Ziel-URL: https://broghammr.github.io/TeslaAPPS/
* Workflow: `.github/workflows/pages.yml` (Push auf `main`)
* Einmalig nötig: Repo → Settings → Pages → Source = **GitHub Actions**







