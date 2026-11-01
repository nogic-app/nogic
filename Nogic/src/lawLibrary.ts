import { isRecord, requestSidecar } from "@/sidecarRequest.ts";

export interface LawStatus {
  article_count: number;
  law_count: number;
}

export const EMPTY_LAW_LIBRARY_MESSAGE =
  "Your law library is empty. Type /add-law to upload a PDF of your country's environmental and landscape laws.";

function isLawStatus(value: unknown): value is LawStatus {
  return (
    isRecord(value) &&
    typeof value.article_count === "number" &&
    typeof value.law_count === "number"
  );
}

export async function fetchLawStatus(): Promise<LawStatus | null> {
  try {
    return await requestSidecar("get_law_status", {}, isLawStatus);
  } catch (error) {
    console.error("Could not read the law library status.", error);
    return null;
  }
}

const LAW_WORDS = new Set([
  "law",
  "laws",
  "legal",
  "legislation",
  "regulation",
  "regulations",
  "decree",
  "statute",
  "statutes",
  "article",
  "articles",
  "loi",
  "lois",
  "dahir",
  "arrete",
  "jurisprudence",
  "tribunal",
  "infraction",
  "penalty",
  "amende",
  "compliance",
  "conformite",
  "urbanism",
  "urbanisme",
  "zoning",
  "permit",
  "permits",
  "permission",
  "authorization",
  "authorisation",
  "license",
  "licence",
  "declaration",
  "setback",
  "setbacks",
  "recul",
  "construction",
  "building",
  "buildings",
  "batiment",
  "demolition",
  "heritage",
  "patrimoine",
  "monument",
  "monuments",
  "environment",
  "environnement",
  "discharge",
  "rejet",
  "assainissement",
  "sewage",
  "wastewater",
  "subdivision",
  "lotissement",
  "amenagement",
  "servitude",
  "servitudes",
  "easement",
  "fence",
  "cloture",
  "height",
  "hauteur",
  "facade",
  "frontage",
  "density",
  "densite",
  "coefficient",
  "accessibility",
  "handicap",
  "photovoltaic",
  "photovoltaique",
  "solar",
  "agricultural",
  "agricole",
  "forest",
  "foret",
  "coastal",
  "littoral",
  "flood",
  "inondation",
  "pollution",
  "nuisance",
  "noise",
  "bruit",
  "signage",
  "enseigne",
  "advertising",
  "publicite",
  "expropriation",
  "preemption",
  "approval",
  "approbation",
  "parcel",
  "parcelle",
  "terrain",
  "emprise",
  "reglement",
  "reglementation",
]);

const LAW_PHRASES = [
  "moroccan law",
  "bulletin officiel",
  "public inquiry",
  "right of way",
  "building permit",
  "construction permit",
  "land use",
  "plan d amenagement",
  "plan d'amenagement",
  "solar panel",
  "solar panels",
  "environmental impact",
  "impact study",
  "etude d impact",
  "etude d'impact",
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9']+/g, " ")
    .trim();
}

/** A light local check so an empty library can answer before calling the model. */
export function isLawQuestion(value: string): boolean {
  const normalized = normalize(value);
  if (!normalized) return false;
  if (normalized.split(" ").some((word) => LAW_WORDS.has(word))) return true;
  return LAW_PHRASES.some((phrase) => normalized.includes(phrase));
}
