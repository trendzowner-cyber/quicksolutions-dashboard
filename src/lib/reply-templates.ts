// Default reply templates (Dutch) — seeded into the ReplyTemplate table on
// first read when it's empty. {naam} is replaced by the reviewer's name.
export const DEFAULT_TEMPLATES: {
  title: string;
  category: string;
  body: string;
  sortOrder: number;
}[] = [
  {
    title: "5 sterren bedanken",
    category: "bedankt",
    body: "Bedankt voor je 5 sterren, {naam}! Fijn dat je tevreden bent met onze service. We staan altijd voor je klaar — tot de volgende keer!",
    sortOrder: 1,
  },
  {
    title: "4 sterren bedanken",
    category: "bedankt",
    body: "Bedankt voor je review, {naam}! We waarderen je feedback en blijven werken aan de puntjes op de i. Graag tot de volgende keer!",
    sortOrder: 2,
  },
  {
    title: "Kort bedanken",
    category: "bedankt",
    body: "Bedankt voor je vertrouwen, {naam}!",
    sortOrder: 3,
  },
  {
    title: "Reparatie duurde lang",
    category: "reparatie",
    body: "Bedankt voor je feedback, {naam}. Het spijt ons dat de reparatie langer duurde dan verwacht — dat is niet de service die we willen bieden. We nemen je feedback mee om dit in de toekomst te verbeteren. Aarzel niet om ons te contacteren als er nog iets is.",
    sortOrder: 4,
  },
  {
    title: "Toestel niet goed gerepareerd",
    category: "reparatie",
    body: "Bedankt voor je eerlijke review, {naam}. Vervelend dat het probleem niet in één keer verholpen was. We komen graag in contact om dit kosteloos voor je op te lossen — neem gerust contact met ons op.",
    sortOrder: 5,
  },
  {
    title: "Communicatie verbeteren",
    category: "communicatie",
    body: "Bedankt voor je feedback, {naam}. Onze excuses dat de communicatie niet vlot verliep — daar nemen we je opmerkingen ter harte. We werken eraan om je beter op de hoogte te houden.",
    sortOrder: 6,
  },
  {
    title: "Klacht over prijs",
    category: "klacht",
    body: "Bedankt voor je review, {naam}. We proberen onze prijzen altijd zo eerlijk mogelijk te houden en werken met duidelijke voorafprijzen. Mocht er iets onduidelijk zijn geweest, neem dan gerust contact op — we kijken graag met je mee.",
    sortOrder: 7,
  },
  {
    title: "Algemene klacht",
    category: "klacht",
    body: "Bedankt voor je feedback, {naam}. Het spijt ons te horen dat je ervaring niet was wat je verwachtte. We willen dit graag rechtzetten — contacteer ons gerust, dan zoeken we samen naar een oplossing.",
    sortOrder: 8,
  },
];

// The reply the auto-thanks bot posts on new 4-5★ reviews.
export const AUTO_THANKS = "Bedankt voor je review en je vertrouwen in QuickSolutions, {naam}! We zijn blij dat je tevreden bent.";
