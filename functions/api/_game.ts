export type Env = {
  AI: {
    run: (model: string, input: unknown) => Promise<unknown>;
  };
  GAMES_DB: D1Database;
  tars_sessions: KVNamespace;
  LLM_MODEL?: string;
  TTS_MODEL?: string;
};

export type HistoryItem = {
  question: string;
  answer: string;
  attributeKey?: string;
};

export type GameMode = "ai-thinks" | "you-think";

export type GameSession = {
  sessionId: string;
  mode: GameMode;
  character: string;
  category: string;
  history: HistoryItem[];
  questionsLeft: number;
  gameOver: boolean;
  won: boolean;
  tarsMemory?: string;
  actualAnswer?: string;
  finalGuess?: string;
};

const MAX_QUESTIONS = 20;
const LLM_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const TTS_MODEL = "@cf/deepgram/aura-2-en";
const TARS_PERSONA = "You are TARS. Dry, dark humor. Short answers. Clipped. Efficient. Never use 'Q:' or 'A:' format.";

const AI_THINKS_CHARACTERS = [
  "Ellen Ripley",
  "Sherlock Holmes",
  "Princess Leia",
  "Indiana Jones",
  "Hermione Granger",
  "James Bond",
  "Katniss Everdeen",
  "Luke Skywalker",
  "Darth Vader",
  "Wonder Woman",
  "Tony Stark",
  "Spider-Man",
  "Batman",
  "Frodo Baggins",
  "Wednesday Addams",
  "Jean-Luc Picard",
  "Sarah Connor",
  "Rocky Balboa",
  "Mulan",
  "Willy Wonka"
];

const YOU_THINK_CATEGORIES = ["character", "object", "place"];
const GRAPH_GUESS_THRESHOLD = 3;
const MIN_GRAPH_QUESTIONS_BEFORE_GUESS = 10;

type CharacterRow = {
  id: number;
  name: string;
  category: string;
  description: string | null;
  attributes: string;
};

type CharacterCandidate = Omit<CharacterRow, "attributes"> & {
  attributes: Record<string, number>;
};

type QuestionRow = {
  id: number;
  text: string;
  attribute_key: string;
  category: string | null;
  priority: number | null;
};

type GraphQuestionResult = {
  text: string;
  attributeKey?: string;
  finalGuess?: string;
};

const DEFAULT_GRAPH_QUESTIONS: Array<{ text: string; attributeKey: string; category?: string; priority: number }> = [
  { text: "Is your answer fictional?", attributeKey: "fictional", priority: 100 },
  { text: "Is it a human being?", attributeKey: "human", priority: 95 },
  { text: "Is it a real living thing?", attributeKey: "real_living", priority: 90 },
  { text: "Is it male?", attributeKey: "male", category: "character", priority: 80 },
  { text: "Is it female?", attributeKey: "female", category: "character", priority: 79 },
  { text: "Is it from a movie?", attributeKey: "from_movie", category: "character", priority: 75 },
  { text: "Is it from a video game?", attributeKey: "from_game", category: "character", priority: 74 },
  { text: "Is it from a book?", attributeKey: "from_book", category: "character", priority: 73 },
  { text: "Is it from TV?", attributeKey: "from_tv", category: "character", priority: 72 },
  { text: "Is it from a comic book?", attributeKey: "from_comic", category: "character", priority: 71 },
  { text: "Is it the main character?", attributeKey: "main_character", category: "character", priority: 68 },
  { text: "Is it a villain?", attributeKey: "villain", category: "character", priority: 67 },
  { text: "Does it involve magic or supernatural powers?", attributeKey: "supernatural", priority: 64 },
  { text: "Is it from a science fiction setting?", attributeKey: "sci_fi", priority: 63 },
  { text: "Is it from a fantasy setting?", attributeKey: "fantasy", priority: 62 },
  { text: "Is it animated?", attributeKey: "animated", category: "character", priority: 60 },
  { text: "Is it an object?", attributeKey: "object", priority: 55 },
  { text: "Is it a place?", attributeKey: "place", priority: 54 },
  { text: "Is it an animal?", attributeKey: "animal", priority: 53 },
  { text: "Is it food or drink?", attributeKey: "food", priority: 52 }
];

const DEFAULT_GRAPH_CHARACTERS: Array<{ name: string; category: string; description: string; attributes: string }> = [
  { name: "Spider-Man", category: "character", description: "Marvel superhero with web-slinging powers.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_movie\":1,\"from_comic\":1,\"main_character\":1}" },
  { name: "Darth Vader", category: "character", description: "Sith lord from Star Wars.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_movie\":1,\"villain\":1,\"sci_fi\":1}" },
  { name: "Luke Skywalker", category: "character", description: "Jedi hero from Star Wars.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_movie\":1,\"main_character\":1,\"sci_fi\":1}" },
  { name: "Yoda", category: "character", description: "Small Jedi master from Star Wars.", attributes: "{\"fictional\":1,\"male\":1,\"from_movie\":1,\"sci_fi\":1,\"supernatural\":1}" },
  { name: "Harry Potter", category: "character", description: "Wizard protagonist from the Harry Potter series.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_movie\":1,\"from_book\":1,\"main_character\":1,\"fantasy\":1,\"supernatural\":1}" },
  { name: "Hermione Granger", category: "character", description: "Brilliant witch from Harry Potter.", attributes: "{\"fictional\":1,\"human\":1,\"female\":1,\"from_movie\":1,\"from_book\":1,\"main_character\":1,\"fantasy\":1,\"supernatural\":1}" },
  { name: "Voldemort", category: "character", description: "Dark wizard villain from Harry Potter.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_movie\":1,\"from_book\":1,\"villain\":1,\"fantasy\":1,\"supernatural\":1}" },
  { name: "Simba", category: "character", description: "Lion king from Disney animation.", attributes: "{\"fictional\":1,\"male\":1,\"from_movie\":1,\"main_character\":1,\"animated\":1,\"animal\":1}" },
  { name: "Woody", category: "character", description: "Cowboy toy from Toy Story.", attributes: "{\"fictional\":1,\"male\":1,\"from_movie\":1,\"main_character\":1,\"animated\":1,\"object\":1}" },
  { name: "Buzz Lightyear", category: "character", description: "Space ranger toy from Toy Story.", attributes: "{\"fictional\":1,\"male\":1,\"from_movie\":1,\"main_character\":1,\"animated\":1,\"object\":1,\"sci_fi\":1}" },
  { name: "Elsa", category: "character", description: "Queen with ice powers from Frozen.", attributes: "{\"fictional\":1,\"human\":1,\"female\":1,\"from_movie\":1,\"main_character\":1,\"animated\":1,\"fantasy\":1,\"supernatural\":1}" },
  { name: "Moana", category: "character", description: "Wayfinder heroine from Disney.", attributes: "{\"fictional\":1,\"human\":1,\"female\":1,\"from_movie\":1,\"main_character\":1,\"animated\":1}" },
  { name: "Jack Sparrow", category: "character", description: "Pirate captain from Pirates of the Caribbean.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_movie\":1,\"main_character\":1}" },
  { name: "Iron Man", category: "character", description: "Armored Marvel superhero Tony Stark.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_movie\":1,\"from_comic\":1,\"main_character\":1,\"sci_fi\":1}" },
  { name: "Captain America", category: "character", description: "Marvel super soldier hero.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_movie\":1,\"from_comic\":1,\"main_character\":1,\"sci_fi\":1}" },
  { name: "Thanos", category: "character", description: "Marvel cosmic villain.", attributes: "{\"fictional\":1,\"male\":1,\"from_movie\":1,\"from_comic\":1,\"villain\":1,\"sci_fi\":1}" },
  { name: "The Joker", category: "character", description: "Batman villain and chaos enthusiast.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_movie\":1,\"from_comic\":1,\"villain\":1}" },
  { name: "Batman", category: "character", description: "Gotham detective superhero.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_movie\":1,\"from_comic\":1,\"main_character\":1}" },
  { name: "Wonder Woman", category: "character", description: "Amazon superhero from DC Comics.", attributes: "{\"fictional\":1,\"human\":1,\"female\":1,\"from_movie\":1,\"from_comic\":1,\"main_character\":1,\"fantasy\":1}" },
  { name: "Forrest Gump", category: "character", description: "Kind-hearted film protagonist.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_movie\":1,\"main_character\":1}" },
  { name: "The Dude", category: "character", description: "Laid-back protagonist of The Big Lebowski.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_movie\":1,\"main_character\":1}" },
  { name: "Tyler Durden", category: "character", description: "Antagonistic figure from Fight Club.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_movie\":1,\"from_book\":1,\"villain\":1}" },
  { name: "Princess Leia", category: "character", description: "Rebel leader from Star Wars.", attributes: "{\"fictional\":1,\"human\":1,\"female\":1,\"from_movie\":1,\"main_character\":1,\"sci_fi\":1}" },
  { name: "Ellen Ripley", category: "character", description: "Alien franchise survivor.", attributes: "{\"fictional\":1,\"human\":1,\"female\":1,\"from_movie\":1,\"main_character\":1,\"sci_fi\":1}" },
  { name: "Indiana Jones", category: "character", description: "Archaeologist adventurer.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_movie\":1,\"main_character\":1}" },
  { name: "James Bond", category: "character", description: "British spy and film icon.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_movie\":1,\"from_book\":1,\"main_character\":1}" },
  { name: "Katniss Everdeen", category: "character", description: "Archer protagonist from The Hunger Games.", attributes: "{\"fictional\":1,\"human\":1,\"female\":1,\"from_movie\":1,\"from_book\":1,\"main_character\":1,\"sci_fi\":1}" },
  { name: "Frodo Baggins", category: "character", description: "Ring bearer from The Lord of the Rings.", attributes: "{\"fictional\":1,\"male\":1,\"from_movie\":1,\"from_book\":1,\"main_character\":1,\"fantasy\":1}" },
  { name: "Gandalf", category: "character", description: "Wizard from Middle-earth.", attributes: "{\"fictional\":1,\"male\":1,\"from_movie\":1,\"from_book\":1,\"fantasy\":1,\"supernatural\":1}" },
  { name: "Gollum", category: "character", description: "Ring-obsessed creature from Middle-earth.", attributes: "{\"fictional\":1,\"male\":1,\"from_movie\":1,\"from_book\":1,\"fantasy\":1}" },
  { name: "Mario", category: "character", description: "Nintendo plumber hero.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_game\":1,\"main_character\":1,\"animated\":1}" },
  { name: "Luigi", category: "character", description: "Mario brother and reluctant hero.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_game\":1,\"main_character\":1,\"animated\":1}" },
  { name: "Princess Peach", category: "character", description: "Mushroom Kingdom princess.", attributes: "{\"fictional\":1,\"human\":1,\"female\":1,\"from_game\":1,\"main_character\":1,\"animated\":1,\"fantasy\":1}" },
  { name: "Link", category: "character", description: "Hero from The Legend of Zelda.", attributes: "{\"fictional\":1,\"male\":1,\"from_game\":1,\"main_character\":1,\"fantasy\":1}" },
  { name: "Zelda", category: "character", description: "Princess from The Legend of Zelda.", attributes: "{\"fictional\":1,\"female\":1,\"from_game\":1,\"main_character\":1,\"fantasy\":1,\"supernatural\":1}" },
  { name: "Sonic", category: "character", description: "Fast blue hedgehog.", attributes: "{\"fictional\":1,\"male\":1,\"from_game\":1,\"main_character\":1,\"animated\":1,\"animal\":1}" },
  { name: "Pikachu", category: "character", description: "Electric Pokemon mascot.", attributes: "{\"fictional\":1,\"from_game\":1,\"main_character\":1,\"animated\":1,\"animal\":1,\"supernatural\":1}" },
  { name: "Kratos", category: "character", description: "God-slaying warrior from God of War.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_game\":1,\"main_character\":1,\"fantasy\":1,\"supernatural\":1}" },
  { name: "Master Chief", category: "character", description: "Armored supersoldier from Halo.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_game\":1,\"main_character\":1,\"sci_fi\":1}" },
  { name: "Lara Croft", category: "character", description: "Tomb-raiding video game adventurer.", attributes: "{\"fictional\":1,\"human\":1,\"female\":1,\"from_game\":1,\"main_character\":1}" },
  { name: "Pac-Man", category: "character", description: "Arcade maze icon.", attributes: "{\"fictional\":1,\"male\":1,\"from_game\":1,\"main_character\":1,\"animated\":1}" },
  { name: "Donkey Kong", category: "character", description: "Nintendo ape.", attributes: "{\"fictional\":1,\"male\":1,\"from_game\":1,\"main_character\":1,\"animated\":1,\"animal\":1}" },
  { name: "Samus Aran", category: "character", description: "Bounty hunter from Metroid.", attributes: "{\"fictional\":1,\"human\":1,\"female\":1,\"from_game\":1,\"main_character\":1,\"sci_fi\":1}" },
  { name: "Cloud Strife", category: "character", description: "Mercenary hero from Final Fantasy VII.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_game\":1,\"main_character\":1,\"fantasy\":1,\"sci_fi\":1}" },
  { name: "Sephiroth", category: "character", description: "Final Fantasy VII antagonist.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_game\":1,\"villain\":1,\"fantasy\":1,\"sci_fi\":1}" },
  { name: "Homer Simpson", category: "character", description: "Animated father from The Simpsons.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_tv\":1,\"main_character\":1,\"animated\":1}" },
  { name: "Peter Griffin", category: "character", description: "Animated father from Family Guy.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_tv\":1,\"main_character\":1,\"animated\":1}" },
  { name: "SpongeBob SquarePants", category: "character", description: "Animated sponge from Bikini Bottom.", attributes: "{\"fictional\":1,\"male\":1,\"from_tv\":1,\"main_character\":1,\"animated\":1,\"animal\":1}" },
  { name: "Patrick Star", category: "character", description: "Animated starfish from SpongeBob.", attributes: "{\"fictional\":1,\"male\":1,\"from_tv\":1,\"animated\":1,\"animal\":1}" },
  { name: "Jerry Mouse", category: "character", description: "Mouse from Tom and Jerry.", attributes: "{\"fictional\":1,\"male\":1,\"from_tv\":1,\"main_character\":1,\"animated\":1,\"animal\":1}" },
  { name: "Bugs Bunny", category: "character", description: "Looney Tunes rabbit.", attributes: "{\"fictional\":1,\"male\":1,\"from_tv\":1,\"main_character\":1,\"animated\":1,\"animal\":1}" },
  { name: "Scooby-Doo", category: "character", description: "Mystery-solving dog.", attributes: "{\"fictional\":1,\"male\":1,\"from_tv\":1,\"main_character\":1,\"animated\":1,\"animal\":1}" },
  { name: "Sherlock Holmes", category: "character", description: "Detective from classic fiction.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_book\":1,\"main_character\":1}" },
  { name: "Wednesday Addams", category: "character", description: "Macabre Addams Family member.", attributes: "{\"fictional\":1,\"human\":1,\"female\":1,\"from_tv\":1,\"from_movie\":1,\"main_character\":1}" },
  { name: "Jean-Luc Picard", category: "character", description: "Starfleet captain from Star Trek.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_tv\":1,\"main_character\":1,\"sci_fi\":1}" },
  { name: "Walter White", category: "character", description: "Chemistry teacher turned criminal.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_tv\":1,\"main_character\":1,\"villain\":1}" },
  { name: "Daenerys Targaryen", category: "character", description: "Dragon-riding queen from Game of Thrones.", attributes: "{\"fictional\":1,\"human\":1,\"female\":1,\"from_tv\":1,\"from_book\":1,\"main_character\":1,\"fantasy\":1}" },
  { name: "Jon Snow", category: "character", description: "Hero from Game of Thrones.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_tv\":1,\"from_book\":1,\"main_character\":1,\"fantasy\":1}" },
  { name: "Eleven", category: "character", description: "Telekinetic character from Stranger Things.", attributes: "{\"fictional\":1,\"human\":1,\"female\":1,\"from_tv\":1,\"main_character\":1,\"sci_fi\":1,\"supernatural\":1}" },
  { name: "Mickey Mouse", category: "character", description: "Disney mouse mascot.", attributes: "{\"fictional\":1,\"male\":1,\"from_movie\":1,\"from_tv\":1,\"main_character\":1,\"animated\":1,\"animal\":1}" },
  { name: "Albert Einstein", category: "character", description: "Real theoretical physicist.", attributes: "{\"human\":1,\"real_living\":1,\"male\":1}" },
  { name: "Michael Jordan", category: "character", description: "Real basketball legend.", attributes: "{\"human\":1,\"real_living\":1,\"male\":1}" },
  { name: "Elvis Presley", category: "character", description: "Real singer and cultural icon.", attributes: "{\"human\":1,\"real_living\":1,\"male\":1}" },
  { name: "Taylor Swift", category: "character", description: "Real singer-songwriter.", attributes: "{\"human\":1,\"real_living\":1,\"female\":1}" },
  { name: "LeBron James", category: "character", description: "Real basketball player.", attributes: "{\"human\":1,\"real_living\":1,\"male\":1}" },
  { name: "Beyonce", category: "character", description: "Real singer and performer.", attributes: "{\"human\":1,\"real_living\":1,\"female\":1}" },
  { name: "Isaac Newton", category: "character", description: "Real physicist and mathematician.", attributes: "{\"human\":1,\"real_living\":1,\"male\":1}" },
  { name: "William Shakespeare", category: "character", description: "Real playwright and poet.", attributes: "{\"human\":1,\"real_living\":1,\"male\":1}" },
  { name: "Abraham Lincoln", category: "character", description: "Real U.S. president.", attributes: "{\"human\":1,\"real_living\":1,\"male\":1}" },
  { name: "Cleopatra", category: "character", description: "Real queen of ancient Egypt.", attributes: "{\"human\":1,\"real_living\":1,\"female\":1}" },
  { name: "Mona Lisa", category: "object", description: "Famous portrait painting.", attributes: "{\"object\":1}" },
  { name: "Golden Snitch", category: "object", description: "Flying ball from Quidditch.", attributes: "{\"fictional\":1,\"object\":1,\"from_movie\":1,\"from_book\":1,\"fantasy\":1,\"supernatural\":1}" },
  { name: "One Ring", category: "object", description: "Powerful ring from The Lord of the Rings.", attributes: "{\"fictional\":1,\"object\":1,\"from_movie\":1,\"from_book\":1,\"fantasy\":1,\"supernatural\":1}" },
  { name: "Lightsaber", category: "object", description: "Energy sword from Star Wars.", attributes: "{\"fictional\":1,\"object\":1,\"from_movie\":1,\"sci_fi\":1}" },
  { name: "Death Star", category: "object", description: "Planet-destroying space station.", attributes: "{\"fictional\":1,\"object\":1,\"from_movie\":1,\"sci_fi\":1}" },
  { name: "TARDIS", category: "object", description: "Time-traveling police box from Doctor Who.", attributes: "{\"fictional\":1,\"object\":1,\"from_tv\":1,\"sci_fi\":1}" },
  { name: "Mjolnir", category: "object", description: "Thor hammer from Norse myth and Marvel.", attributes: "{\"fictional\":1,\"object\":1,\"from_movie\":1,\"from_comic\":1,\"fantasy\":1,\"supernatural\":1}" },
  { name: "Infinity Gauntlet", category: "object", description: "Marvel artifact for Infinity Stones.", attributes: "{\"fictional\":1,\"object\":1,\"from_movie\":1,\"from_comic\":1,\"sci_fi\":1,\"supernatural\":1}" },
  { name: "Sorting Hat", category: "object", description: "Talking hat from Harry Potter.", attributes: "{\"fictional\":1,\"object\":1,\"from_movie\":1,\"from_book\":1,\"fantasy\":1,\"supernatural\":1}" },
  { name: "Flux Capacitor", category: "object", description: "Time travel device from Back to the Future.", attributes: "{\"fictional\":1,\"object\":1,\"from_movie\":1,\"sci_fi\":1}" },
  { name: "Niffler", category: "character", description: "Treasure-loving magical creature.", attributes: "{\"fictional\":1,\"from_movie\":1,\"from_book\":1,\"animal\":1,\"fantasy\":1,\"supernatural\":1}" },
  { name: "Grass", category: "object", description: "Common real plant ground cover.", attributes: "{\"real_living\":1}" },
  { name: "Pizza", category: "object", description: "Popular food.", attributes: "{\"object\":1,\"food\":1}" },
  { name: "Coffee", category: "object", description: "Caffeinated drink.", attributes: "{\"object\":1,\"food\":1}" },
  { name: "Hogwarts", category: "place", description: "Wizarding school from Harry Potter.", attributes: "{\"fictional\":1,\"place\":1,\"from_movie\":1,\"from_book\":1,\"fantasy\":1,\"supernatural\":1}" },
  { name: "Narnia", category: "place", description: "Fantasy world reached through a wardrobe.", attributes: "{\"fictional\":1,\"place\":1,\"from_movie\":1,\"from_book\":1,\"fantasy\":1,\"supernatural\":1}" },
  { name: "Mordor", category: "place", description: "Dark realm in Middle-earth.", attributes: "{\"fictional\":1,\"place\":1,\"from_movie\":1,\"from_book\":1,\"fantasy\":1}" },
  { name: "Wakanda", category: "place", description: "Fictional African nation from Marvel.", attributes: "{\"fictional\":1,\"place\":1,\"from_movie\":1,\"from_comic\":1,\"sci_fi\":1}" },
  { name: "Atlantis", category: "place", description: "Legendary underwater city.", attributes: "{\"fictional\":1,\"place\":1,\"fantasy\":1}" },
  { name: "Gotham City", category: "place", description: "Batman home city.", attributes: "{\"fictional\":1,\"place\":1,\"from_movie\":1,\"from_comic\":1}" },
  { name: "Metropolis", category: "place", description: "Superman home city.", attributes: "{\"fictional\":1,\"place\":1,\"from_movie\":1,\"from_comic\":1}" },
  { name: "Middle-earth", category: "place", description: "Fantasy setting of Tolkien stories.", attributes: "{\"fictional\":1,\"place\":1,\"from_movie\":1,\"from_book\":1,\"fantasy\":1}" },
  { name: "Bikini Bottom", category: "place", description: "Undersea town from SpongeBob.", attributes: "{\"fictional\":1,\"place\":1,\"from_tv\":1,\"animated\":1}" },
  { name: "Springfield", category: "place", description: "Home city of The Simpsons.", attributes: "{\"fictional\":1,\"place\":1,\"from_tv\":1,\"animated\":1}" },
  { name: "Jurassic Park", category: "place", description: "Dinosaur theme park setting.", attributes: "{\"fictional\":1,\"place\":1,\"from_movie\":1,\"from_book\":1,\"sci_fi\":1}" },
  { name: "Emerald City", category: "place", description: "Capital city in Oz.", attributes: "{\"fictional\":1,\"place\":1,\"from_movie\":1,\"from_book\":1,\"fantasy\":1}" },
  { name: "Death Valley", category: "place", description: "Real desert valley in the United States.", attributes: "{\"place\":1}" },
  { name: "Mount Everest", category: "place", description: "Real highest mountain on Earth.", attributes: "{\"place\":1}" },
  { name: "Superman", category: "character", description: "DC superhero from Krypton.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_movie\":1,\"from_comic\":1,\"main_character\":1,\"sci_fi\":1}" },
  { name: "Dumbledore", category: "character", description: "Headmaster wizard from Harry Potter.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_movie\":1,\"from_book\":1,\"fantasy\":1,\"supernatural\":1}" },
  { name: "Black Panther", category: "character", description: "Marvel hero and king of Wakanda.", attributes: "{\"fictional\":1,\"human\":1,\"male\":1,\"from_movie\":1,\"from_comic\":1,\"main_character\":1,\"sci_fi\":1}" },
  { name: "Dora the Explorer", category: "character", description: "Animated child explorer from TV.", attributes: "{\"fictional\":1,\"human\":1,\"female\":1,\"from_tv\":1,\"main_character\":1,\"animated\":1}" },
  { name: "Coca-Cola", category: "object", description: "Popular soft drink.", attributes: "{\"object\":1,\"food\":1}" },
];

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store"
    }
  });
}

export async function readBody<T extends Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

export async function createSession(env: Env, mode: GameMode = "ai-thinks", category = "something") {
  const sessionId = crypto.randomUUID();
  const safeMode: GameMode = mode === "you-think" ? "you-think" : "ai-thinks";
  const character = AI_THINKS_CHARACTERS[Math.floor(Math.random() * AI_THINKS_CHARACTERS.length)];
  const safeCategory = YOU_THINK_CATEGORIES.includes(category) ? category : "character, object, or place";
  const session: GameSession = {
    sessionId,
    mode: safeMode,
    character,
    category: safeMode === "you-think" ? safeCategory : "",
    history: [],
    questionsLeft: MAX_QUESTIONS,
    gameOver: false,
    won: false
  };
  await env.tars_sessions.put(sessionId, JSON.stringify(session), { expirationTtl: 1800 }); // 30 min
  return session;
}

export async function getSession(env: Env, sessionId: unknown): Promise<GameSession | null> {
  if (typeof sessionId !== "string") return null;
  try {
    const raw = await env.tars_sessions.get(sessionId);
    if (!raw) return null;
    const session = JSON.parse(raw) as GameSession;
    return {
      ...session,
      mode: session.mode ?? "ai-thinks",
      category: session.category ?? "",
      tarsMemory: session.tarsMemory ?? "",
      actualAnswer: session.actualAnswer ?? undefined,
      finalGuess: session.finalGuess ?? undefined
    };
  } catch {
    return null;
  }
}

async function saveSession(env: Env, session: GameSession) {
  await env.tars_sessions.put(session.sessionId, JSON.stringify(session), { expirationTtl: 1800 });
}

export async function getTarsMemory(env: Env): Promise<string> {
  if (!env.GAMES_DB) return "";

  try {
    const { results } = await env.GAMES_DB.prepare(
      `SELECT mode, character, won, questions_used, history, created_at
       FROM games
       ORDER BY created_at DESC
       LIMIT 15`
    ).all();

    if (!results || results.length === 0) return "";

    const prompt = `You are TARS reviewing past 20 Questions games with a player.
A one-sentence observation about these games. Data only, no psychoanalysis. Dry and brief.
No character analysis. Do not latch onto a single repeated phrase. Here are the last ${results.length} games:

${results
  .map(
    (r: any, i: number) =>
      `Game ${i + 1}: mode=${r.mode}, character=${r.character || "N/A"}, won=${r.won ? "Yes" : "No"}, questions=${r.questions_used}`
  )
  .join("\n")}

Your memory summary (one sentence, observational only):`;

    const response = await env.AI.run(env.LLM_MODEL ?? LLM_MODEL, {
      messages: [
        { role: "system", content: "You are TARS. You have a dry, deadpan delivery. Summarize briefly." },
        { role: "user", content: prompt }
      ],
      max_tokens: 100,
      temperature: 0.5
    });

    const memory = extractText(response);
    return memory
      ? `\n\nPast games context: ${memory}`
      : "";
  } catch {
    return "";
  }
}

function historyText(session: GameSession) {
  if (session.history.length === 0) return "No questions asked yet.";
  return session.history.map((item, index) => `[${index + 1}] ${item.question} → ${item.answer || "Pending"}`).join("\n");
}

export async function answerQuestion(env: Env, session: GameSession, question: string) {
  const prompt = `${TARS_PERSONA}
Your secret: ${session.character}

Short answers only: "Yes." "No." "Kind of." "Sort of." "Not exactly." "Correct." "Incorrect."
You may add ONE short quip. No explanations. No apologies.

HISTORY: ${historyText(session)}${session.tarsMemory || ""}`;

  const response = await env.AI.run(env.LLM_MODEL ?? LLM_MODEL, {
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: question }
    ],
    max_tokens: 60,
    temperature: 0.7
  });

  return extractText(response) || fallbackAnswer(question);
}

export async function askYouThinkQuestion(env: Env, session: GameSession, latestAnswer?: string) {
  const graphQuestion = await askGraphQuestion(env, session, latestAnswer);
  if (graphQuestion) return graphQuestion;

  const prompt = `${TARS_PERSONA}
You are playing 20 Questions in reverse. The user picked a ${session.category || "thing"}.

Rules:
- Ask ONE yes/no question at a time.
- Do not repeat questions.
- Keep it under 15 words, plus one short quip if useful.
- Sound conversational, not like a form.

History:
${historyText(session)}

Latest answer: ${latestAnswer || "Ready."}`;

  const response = await env.AI.run(env.LLM_MODEL ?? LLM_MODEL, {
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: "Your turn." }
    ],
    max_tokens: 60,
    temperature: 0.8
  });

  const text = extractText(response);
  if (text) {
    return { text };
  }

  return {
    text: "Is it fictional? My probability net wants an easy warm-up.",
    attributeKey: "fictional"
  };
}

export async function guessYouThinkAnswer(env: Env, session: GameSession) {
  const candidates = await getGraphCandidates(env, session);
  const prompt = `${TARS_PERSONA}
You are playing 20 Questions in reverse. Make a final guess.
Use your general knowledge and the history. Do not dump data. One dry line. Start with the guess.

History:
${historyText(session)}`;

  const response = await env.AI.run(env.LLM_MODEL ?? LLM_MODEL, {
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: "Make your final guess." }
    ],
    max_tokens: 60,
    temperature: 0.7
  });

  const guess = extractText(response) || "A toaster. My confidence is low, but my delivery remains excellent.";
  return verifyGraphGuess(guess, candidates);
}

async function askGraphQuestion(env: Env, session: GameSession, latestAnswer?: string): Promise<GraphQuestionResult | null> {
  const candidates = await getGraphCandidates(env, session);
  if (candidates.length === 0) return null;
  const answeredGraphQuestions = countAnsweredGraphQuestions(session);
  const canGuess = answeredGraphQuestions >= MIN_GRAPH_QUESTIONS_BEFORE_GUESS;

  if (canGuess && candidates.length <= 1) {
    const guess = await phraseGraphGuess(env, session, candidates[0]);
    return { text: guess, finalGuess: candidates[0].name };
  }

  if (canGuess && candidates.length <= GRAPH_GUESS_THRESHOLD) {
    const guess = await guessYouThinkAnswer(env, session);
    return { text: guess, finalGuess: extractGuessName(guess) || candidates[0].name };
  }

  const bestQuestion = await chooseBestGraphQuestion(env, session, candidates);
  if (!bestQuestion) return null;

  const text = await phraseGraphQuestion(env, session, bestQuestion, candidates.length, latestAnswer);
  return { text, attributeKey: bestQuestion.attribute_key };
}

async function getGraphCandidates(env: Env, session: GameSession): Promise<CharacterCandidate[]> {
  if (!env.GAMES_DB) return [];

  try {
    await ensureGraphTables(env);
    const category = normalizeCategory(session.category);
    const query = category
      ? `SELECT id, name, category, description, attributes FROM characters WHERE category = ? ORDER BY name`
      : `SELECT id, name, category, description, attributes FROM characters ORDER BY name`;
    const statement = env.GAMES_DB.prepare(query);
    const { results } = category ? await statement.bind(category).all<CharacterRow>() : await statement.all<CharacterRow>();
    const filters = graphFiltersFromHistory(session);

    return (results || [])
      .map(toCandidate)
      .filter((candidate): candidate is CharacterCandidate => Boolean(candidate))
      .filter((candidate) =>
        filters.every((filter) => {
          const value = candidate.attributes[filter.attributeKey] ?? 0;
          return value === filter.value;
        })
      );
  } catch {
    return [];
  }
}

async function chooseBestGraphQuestion(env: Env, session: GameSession, candidates: CharacterCandidate[]) {
  const asked = new Set(session.history.map((item) => item.attributeKey).filter(Boolean));
  const category = normalizeCategory(session.category);

  const statement = category
    ? env.GAMES_DB.prepare(
        `SELECT id, text, attribute_key, category, priority
         FROM questions
         WHERE (category IS NULL OR category = ?)
         ORDER BY priority DESC, id ASC`
      )
    : env.GAMES_DB.prepare(
        `SELECT id, text, attribute_key, category, priority
         FROM questions
         ORDER BY priority DESC, id ASC`
      );
  const { results } = category ? await statement.bind(category).all<QuestionRow>() : await statement.all<QuestionRow>();

  let best: QuestionRow | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const question of results || []) {
    if (asked.has(question.attribute_key)) continue;
    const yesCount = candidates.filter((candidate) => (candidate.attributes[question.attribute_key] ?? 0) === 1).length;
    const noCount = candidates.length - yesCount;
    if (yesCount === 0 || noCount === 0) continue;

    const splitDistance = Math.abs(yesCount - noCount) / candidates.length;
    const priorityBonus = (question.priority || 0) / 10000;
    const score = splitDistance - priorityBonus;
    if (score < bestScore) {
      best = question;
      bestScore = score;
    }
  }

  return best;
}

async function phraseGraphQuestion(
  env: Env,
  session: GameSession,
  question: QuestionRow,
  _candidateCount: number,
  latestAnswer?: string
) {
  try {
    const response = await env.AI.run(env.LLM_MODEL ?? LLM_MODEL, {
      messages: [
        {
          role: "system",
          content: `${TARS_PERSONA}
You are playing 20 Questions in reverse. Ask a natural yes/no question to narrow down what the player is thinking of.
You need to figure out: ${question.text}
Narrow it down.
History: ${historyText(session)}
Keep it under 15 words plus one short dry quip.`
        },
        {
          role: "user",
          content: `Latest answer: ${latestAnswer || "Ready."}
Ask the next question.`
        }
      ],
      max_tokens: 60,
      temperature: 0.7
    });

    return extractText(response) || question.text;
  } catch {
    return question.text;
  }
}

async function phraseGraphGuess(env: Env, session: GameSession, candidate: CharacterCandidate) {
  try {
    const response = await env.AI.run(env.LLM_MODEL ?? LLM_MODEL, {
      messages: [
        {
          role: "system",
          content: `${TARS_PERSONA}
Make one final 20 Questions guess in one dry line. Start with the name.`
        },
        {
          role: "user",
          content: `Only remaining candidate: ${candidate.name}
Description: ${candidate.description || "No dossier."}
History:
${historyText(session)}`
        }
      ],
      max_tokens: 60,
      temperature: 0.6
    });

    return extractText(response) || `Final guess: ${candidate.name}. The database has spoken. Mildly ominous.`;
  } catch {
    return `Final guess: ${candidate.name}. The database has spoken. Mildly ominous.`;
  }
}

async function ensureGraphTables(env: Env) {
  await env.GAMES_DB.prepare(
    `CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT 'character',
      description TEXT,
      attributes TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();

  await env.GAMES_DB.prepare(
    `CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL UNIQUE,
      attribute_key TEXT NOT NULL,
      category TEXT,
      priority INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run();

  const { results: characterResults } = await env.GAMES_DB.prepare(`SELECT COUNT(*) AS count FROM characters`).all<{ count: number }>();
  if ((characterResults?.[0]?.count || 0) === 0) {
    const characterStatements = DEFAULT_GRAPH_CHARACTERS.map((character) =>
      env.GAMES_DB.prepare(
        `INSERT OR IGNORE INTO characters (name, category, description, attributes)
         VALUES (?, ?, ?, ?)`
      ).bind(character.name, character.category, character.description, character.attributes)
    );
    await env.GAMES_DB.batch(characterStatements);
  }

  const { results } = await env.GAMES_DB.prepare(`SELECT COUNT(*) AS count FROM questions`).all<{ count: number }>();
  if ((results?.[0]?.count || 0) > 0) return;

  const statements = DEFAULT_GRAPH_QUESTIONS.map((question) =>
    env.GAMES_DB.prepare(
      `INSERT OR IGNORE INTO questions (text, attribute_key, category, priority)
       VALUES (?, ?, ?, ?)`
    ).bind(question.text, question.attributeKey, question.category || null, question.priority)
  );
  await env.GAMES_DB.batch(statements);
}

function graphFiltersFromHistory(session: GameSession) {
  return session.history
    .map((item) => {
      if (!item.attributeKey || !item.answer) return null;
      const value = answerToBinary(item.answer);
      return value === null ? null : { attributeKey: item.attributeKey, value };
    })
    .filter((filter): filter is { attributeKey: string; value: number } => Boolean(filter));
}

function countAnsweredGraphQuestions(session: GameSession) {
  return session.history.filter((item) => item.attributeKey && item.answer).length;
}

function answerToBinary(answer: string) {
  const normalized = answer.trim().toLowerCase();
  if (normalized === "yes" || normalized === "kind of" || normalized === "sort of") return 1;
  if (normalized === "no" || normalized === "not exactly") return 0;
  return null;
}

function toCandidate(row: CharacterRow): CharacterCandidate | null {
  try {
    const parsed = JSON.parse(row.attributes || "{}");
    if (!parsed || typeof parsed !== "object") return null;
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      description: row.description,
      attributes: parsed as Record<string, number>
    };
  } catch {
    return null;
  }
}

function normalizeCategory(category: string) {
  const normalized = category.trim().toLowerCase();
  if (normalized === "character" || normalized === "object" || normalized === "place") return normalized;
  if (normalized.includes("character") && normalized.includes("object") && normalized.includes("place")) return "";
  return "";
}

function extractGuessName(guess: string) {
  const match = guess.match(/final guess:\s*([^.!?\n]+)/i);
  if (match?.[1]) return match[1].trim();
  return guess.split(/[.!?\n]/)[0]?.trim();
}

function verifyGraphGuess(guess: string, candidates: CharacterCandidate[]) {
  if (candidates.length === 0) return guess;

  const guessedName = normalize(extractGuessName(guess) || "");
  if (!guessedName) return guess;
  const verified = candidates.find((candidate) => {
    const candidateName = normalize(candidate.name);
    return candidateName === guessedName || candidateName.includes(guessedName) || guessedName.includes(candidateName);
  });
  if (!verified) return guess;

  const trailing = guess.replace(/^final guess:\s*/i, "").replace(new RegExp(`^${escapeRegExp(extractGuessName(guess) || "")}\\s*`, "i"), "").trim();
  return trailing ? `${verified.name} ${trailing}` : verified.name;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function logGame(env: Env, session: GameSession) {
  if (!env.GAMES_DB) return;

  await env.GAMES_DB.prepare(
    `CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      character TEXT,
      category TEXT,
      won BOOLEAN NOT NULL,
      questions_used INTEGER NOT NULL,
      total_questions INTEGER NOT NULL DEFAULT 20,
      history TEXT NOT NULL,
      voice_mode_used BOOLEAN DEFAULT false,
      created_at TEXT NOT NULL
    )`
  ).run();

  const questionsUsed = Math.max(0, MAX_QUESTIONS - session.questionsLeft);
  const character = session.mode === "you-think" ? session.actualAnswer ?? session.finalGuess ?? "" : session.character;

  await env.GAMES_DB.prepare(
    `INSERT OR REPLACE INTO games (
      id,
      mode,
      character,
      category,
      won,
      questions_used,
      total_questions,
      history,
      voice_mode_used,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      session.sessionId,
      session.mode,
      character,
      session.mode === "you-think" ? session.category : "",
      session.won ? 1 : 0,
      questionsUsed,
      MAX_QUESTIONS,
      JSON.stringify(session.history),
      0,
      new Date().toISOString()
    )
    .run();
}

export async function tts(env: Env, text: string) {
  try {
    const response = await env.AI.run(env.TTS_MODEL ?? TTS_MODEL, { text });
    return extractAudio(response);
  } catch {
    return "";
  }
}

export function isCorrectGuess(guess: string, character: string) {
  return normalize(guess) === normalize(character);
}

export function lossMessage(session: GameSession) {
  return `That was question twenty. The character was ${session.character}. I would say this was close, but my honesty setting is unfortunately enabled.`;
}

export function greeting(session?: GameSession) {
  if (session?.mode === "you-think") {
    return "Think of a character, object, or place. Lock it in your skull vault, then hit ready. I will ask the questions. Disturbing, but efficient.";
  }
  return "I am TARS. I have selected a character. You have twenty yes-or-no questions and one fragile human ego. Begin.";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function extractText(response: unknown): string {
  if (typeof response === "string") return response.trim();
  if (!response || typeof response !== "object") return "";
  const record = response as Record<string, unknown>;
  const candidates = [record.response, record.result, record.text, record.output];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

function extractAudio(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const record = response as Record<string, unknown>;
  const candidates = [record.audio, record.audioBase64, record.result, record.response];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return "";
}

function fallbackAnswer(question: string) {
  const lower = question.toLowerCase();
  if (lower.startsWith("is ") || lower.startsWith("are ") || lower.startsWith("was ")) {
    return "Unknown. My higher reasoning module is temporarily admiring its own reflection.";
  }
  return "Ask that as a yes-or-no question. I have limits, even if they are mostly your fault.";
}

// Re-export for use in handler files
export { saveSession };
