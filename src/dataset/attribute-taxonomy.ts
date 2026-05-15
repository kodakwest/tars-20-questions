import type { AttributeDefinition, Domain } from "./types";

export const ATTRIBUTE_DEFINITIONS: AttributeDefinition[] = [
  attr("is_character", "Character", "Entity is a person, character, or character-like being.", ["character"], "low", [
    "Is it a character?"
  ]),
  attr("is_object", "Object", "Entity is an object, item, artifact, or thing.", ["object"], "low", [
    "Is it an object?"
  ]),
  attr("is_place", "Place", "Entity is a place or location.", ["place"], "low", [
    "Is it a place?"
  ]),
  attr("is_fictional", "Fictional", "Entity exists mainly as fiction.", ["character", "object", "place"], "low", [
    "Is it fictional?"
  ]),
  attr("is_real", "Real", "Entity exists in the real world.", ["character", "object", "place"], "low", [
    "Is it real?"
  ]),
  attr("is_human", "Human", "Entity is or primarily depicts a human.", ["character"], "medium", [
    "Is it human?"
  ]),
  attr("is_animal", "Animal", "Entity is an animal or animal-like being.", ["character", "object"], "medium", [
    "Is it an animal?"
  ]),
  attr("from_video_game", "From video game", "Entity is known from a video game.", ["character", "object", "place"], "low", [
    "Is it from a video game?"
  ]),
  attr("from_movie", "From movie", "Entity is known from a movie.", ["character", "object", "place"], "low", [
    "Is it from a movie?"
  ]),
  attr("from_tv", "From TV", "Entity is known from television.", ["character", "object", "place"], "low", [
    "Is it from TV?"
  ]),
  attr("from_book", "From book", "Entity is known from books or literature.", ["character", "object", "place"], "low", [
    "Is it from a book?"
  ]),
  attr("from_comic", "From comic", "Entity is known from comics.", ["character", "object", "place"], "low", [
    "Is it from a comic?"
  ]),
  attr("is_animated", "Animated", "Entity is commonly depicted in animation.", ["character", "place"], "medium", [
    "Is it animated?"
  ]),
  attr("is_supernatural", "Supernatural", "Entity involves magic, paranormal, or supernatural powers.", ["character", "object", "place"], "medium", [
    "Does it involve magic or supernatural powers?"
  ]),
  attr("is_scifi", "Science fiction", "Entity is associated with science fiction.", ["character", "object", "place"], "medium", [
    "Is it from a science fiction setting?"
  ]),
  attr("is_fantasy", "Fantasy", "Entity is associated with fantasy.", ["character", "object", "place"], "medium", [
    "Is it from a fantasy setting?"
  ]),
  attr("is_food_or_drink", "Food or drink", "Object is edible or drinkable.", ["object"], "low", [
    "Is it food or drink?"
  ]),
  attr("is_tool_or_device", "Tool or device", "Object is used as a tool, device, or machine.", ["object"], "medium", [
    "Is it a tool or device?"
  ]),
  attr("is_natural_place", "Natural place", "Place is primarily a natural geographic feature.", ["place"], "medium", [
    "Is it a natural place?"
  ]),
  attr("is_city_or_settlement", "City or settlement", "Place is a city, town, or settlement.", ["place"], "low", [
    "Is it a city or settlement?"
  ])
];

export const ATTRIBUTE_BY_KEY = new Map(ATTRIBUTE_DEFINITIONS.map((definition) => [definition.key, definition]));

export function attributesForDomain(domain: Domain) {
  return ATTRIBUTE_DEFINITIONS.filter((definition) => definition.appliesTo.includes(domain));
}

function attr(
  key: string,
  displayName: string,
  description: string,
  appliesTo: Domain[],
  ambiguityRisk: AttributeDefinition["ambiguityRisk"],
  questionTemplates: string[]
): AttributeDefinition {
  return {
    id: `attr:${key}`,
    key,
    displayName,
    description,
    appliesTo,
    answerType: "yes_no_kind_of",
    ambiguityRisk,
    questionTemplates
  };
}
