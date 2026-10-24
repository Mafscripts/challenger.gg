import { ruleSections, ruleText } from "./rulebook.js";

export const ruleUpdateOptions = ruleSections.map(section => ({
  id: section.id, kind: section.id === "topfragg-variant" ? "topfragg_variant_rules" : `rules:${section.id}`,
  label: section.title, defaultText: section.rules.map(ruleText).join("\n"), url: `/rules#${section.id}`,
}));
export const ruleUpdateForKind = kind => ruleUpdateOptions.find(option => option.kind === kind);
export const ruleUpdateForId = id => ruleUpdateOptions.find(option => option.id === id);
