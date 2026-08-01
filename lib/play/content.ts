/**
 * Local demo content bank for "Turing Bet" (Human or AI).
 *
 * All copy below is original, written for this demo — not sourced from any
 * real AI model output or real human author. Answer metadata (`isAI`,
 * `explanation`) is kept in this module only; presentation components never
 * receive it until after the player has locked in a choice, so it can't leak
 * into the UI by accident.
 *
 * Swap-in note: to use real content later, keep this same shape
 * (`TuringBetItem[]`) and load it from a remote source instead — nothing in
 * the game screen assumes the content is local.
 */

export type TuringBetCategory =
  | 'Product Blurb'
  | 'Social Caption'
  | 'Micro-Fiction'
  | 'Artist Statement'
  | 'Restaurant Review'
  | 'Bio';

export type TuringBetItem = {
  id: string;
  category: TuringBetCategory;
  text: string;
  isAI: boolean;
  explanation: string;
};

export const TURING_BET_CONTENT: TuringBetItem[] = [
  {
    id: 'pb-1',
    category: 'Product Blurb',
    text: 'Elevate your daily routine with a meticulously engineered solution that seamlessly integrates innovation and comfort for a truly transformative experience.',
    isAI: true,
    explanation:
      'Stacked abstract adjectives ("meticulously engineered," "seamlessly integrates") with no concrete product detail — a classic AI-copy tell.',
  },
  {
    id: 'pb-2',
    category: 'Product Blurb',
    text: "The zipper on the left pocket sticks a little for the first week, then it's fine. We know because we carry these ourselves.",
    isAI: false,
    explanation:
      'Admits a specific, minor flaw and references a personal anecdote — the kind of detail marketing copy generators tend to smooth over.',
  },
  {
    id: 'pb-3',
    category: 'Product Blurb',
    text: 'Unlock unparalleled performance and unlock your true potential with cutting-edge technology designed to unlock new possibilities every single day.',
    isAI: true,
    explanation:
      'Repeats "unlock" as a filler verb three times with no new information added each time — a generation artifact.',
  },
  {
    id: 'pb-4',
    category: 'Product Blurb',
    text: "Runs about a half size small. Sarah in the warehouse says to size up if you're between sizes; she's been right every time.",
    isAI: false,
    explanation: 'Names a specific, unverifiable coworker and a casual aside — too idiosyncratic for typical generated copy.',
  },
  {
    id: 'sc-1',
    category: 'Social Caption',
    text: 'Living my best life, one adventure at a time! ✨ Grateful for this incredible journey and all the amazing moments along the way.',
    isAI: true,
    explanation: 'Generic gratitude phrasing with no anchor to an actual event, place, or person.',
  },
  {
    id: 'sc-2',
    category: 'Social Caption',
    text: 'the bus was 40 min late and I still made it on time to see this. worth it I guess',
    isAI: false,
    explanation: 'Lowercase, a specific mundane complaint, and a deadpan "I guess" — a very particular kind of understatement.',
  },
  {
    id: 'sc-3',
    category: 'Social Caption',
    text: "Embracing every sunset as a reminder that new beginnings are always on the horizon. 🌅 Here's to growth and gratitude!",
    isAI: true,
    explanation: 'Sunset-as-metaphor-for-growth is one of the most common generated caption templates.',
  },
  {
    id: 'sc-4',
    category: 'Social Caption',
    text: 'my nephew named the goldfish "Excel" and honestly a great choice',
    isAI: false,
    explanation: 'A very specific, oddly funny real-life detail that would be a strange thing to fabricate.',
  },
  {
    id: 'mf-1',
    category: 'Micro-Fiction',
    text: 'In a world where technology and humanity intertwine, Sarah discovered that the greatest journey was the one within herself.',
    isAI: true,
    explanation: '"In a world where..." plus a vague inward-journey moral is a stock opening pattern with no concrete image.',
  },
  {
    id: 'mf-2',
    category: 'Micro-Fiction',
    text: "The toaster had opinions about bread, and it kept them mostly to itself until Tuesday.",
    isAI: false,
    explanation: 'A specific, weird, funny premise with a precise detail ("Tuesday") that commits to an odd choice rather than a safe one.',
  },
  {
    id: 'mf-3',
    category: 'Micro-Fiction',
    text: 'As the sun set on the horizon, she realized that every ending is simply a new beginning waiting to unfold.',
    isAI: true,
    explanation: 'Sunset imagery paired with an "ending is a beginning" cliché, stated without any specific character detail.',
  },
  {
    id: 'mf-4',
    category: 'Micro-Fiction',
    text: 'Grandpa swore the ghost only came around when the Wi-Fi went out, like it was checking for an opening.',
    isAI: false,
    explanation: 'A specific, oddly practical family anecdote with dry humor — the kind of concrete weirdness that reads as remembered rather than invented on demand.',
  },
  {
    id: 'as-1',
    category: 'Artist Statement',
    text: 'This piece explores the delicate interplay between light and shadow, inviting viewers to reflect on the profound complexity of the human experience.',
    isAI: true,
    explanation: '"Delicate interplay," "profound complexity" — abstract art-statement filler with nothing tying it to the actual piece.',
  },
  {
    id: 'as-2',
    category: 'Artist Statement',
    text: "I made this because I was mad at my landlord and had leftover paint. It's called 'March Rent.'",
    isAI: false,
    explanation: 'A specific, petty, funny real motivation and a title that only makes sense with that context.',
  },
  {
    id: 'as-3',
    category: 'Artist Statement',
    text: 'Through a harmonious fusion of texture and form, this work seeks to capture the essence of transformation and renewal.',
    isAI: true,
    explanation: '"Harmonious fusion," "capture the essence" — templated aesthetic language that could describe almost any piece.',
  },
  {
    id: 'as-4',
    category: 'Artist Statement',
    text: 'I only had three colors of clay left at the studio, so the sculpture is three colors. That is the whole statement.',
    isAI: false,
    explanation: 'Deflates the genre entirely with a blunt, practical, self-aware admission — an unusual rhetorical move for generated art copy.',
  },
  {
    id: 'rr-1',
    category: 'Restaurant Review',
    text: 'An exceptional culinary experience that tantalizes the taste buds with a delightful array of flavors, ambiance, and impeccable service.',
    isAI: true,
    explanation: '"Tantalizes the taste buds," "impeccable service" — review boilerplate with zero named dishes or specifics.',
  },
  {
    id: 'rr-2',
    category: 'Restaurant Review',
    text: 'Got the mushroom dumplings twice because I forgot I already ordered them once. No regrets. The waiter just laughed.',
    isAI: false,
    explanation: 'A specific, self-deprecating mistake and a named dish — too particular and unflattering-to-self to be typical marketing-style writing.',
  },
  {
    id: 'rr-3',
    category: 'Restaurant Review',
    text: 'From the moment you walk in, you are greeted with a symphony of aromas that promise an unforgettable dining adventure.',
    isAI: true,
    explanation: '"Symphony of aromas" and "unforgettable adventure" are stock sensory metaphors used across countless generated reviews.',
  },
  {
    id: 'rr-4',
    category: 'Restaurant Review',
    text: "Table wobbled the whole time, we jammed a napkin under the leg. Pasta was still great, honestly worth the wobble.",
    isAI: false,
    explanation: 'A specific physical annoyance solved in a specific way, then dismissed casually — concrete and unpolished.',
  },
  {
    id: 'bio-1',
    category: 'Bio',
    text: 'Passionate innovator dedicated to leveraging synergy and driving impactful results across diverse, dynamic environments.',
    isAI: true,
    explanation: '"Leveraging synergy," "dynamic environments" — corporate buzzword salad with no actual role, name, or achievement.',
  },
  {
    id: 'bio-2',
    category: 'Bio',
    text: 'Once fixed a printer jam during a board meeting using a hair clip. Been asked to do IT ever since.',
    isAI: false,
    explanation: 'A single, specific, slightly self-deprecating anecdote used as an entire bio — an unusual but very human structural choice.',
  },
  {
    id: 'bio-3',
    category: 'Bio',
    text: 'Results-driven visionary committed to empowering teams, fostering growth, and delivering excellence at every touchpoint of the journey.',
    isAI: true,
    explanation:
      '"Results-driven," "empowering," "every touchpoint" — a chain of interchangeable buzzwords with no name, role, or verifiable fact anywhere.',
  },
  {
    id: 'bio-4',
    category: 'Bio',
    text: 'Third-generation beekeeper, first-generation spreadsheet enjoyer. The bees do not respect my pivot tables.',
    isAI: false,
    explanation:
      'Pairs two oddly specific identities and lands a dry joke at its own expense — committed, particular humor that generated bios rarely risk.',
  },
  {
    id: 'sc-5',
    category: 'Social Caption',
    text: 'Chasing dreams and making memories! ✨ So blessed to be surrounded by amazing energy on this beautiful adventure called life.',
    isAI: true,
    explanation:
      '"Adventure called life" plus stacked feel-good abstractions ("dreams," "memories," "energy") with no actual event — a caption-generator staple.',
  },
  {
    id: 'sc-6',
    category: 'Social Caption',
    text: 'update: the seagull came back for the second sandwich. no notes, honestly. committed to the bit',
    isAI: false,
    explanation:
      'Lowercase running-update format, a petty specific antagonist, and internet-native phrasing ("committed to the bit") — idiosyncratic in a way templates rarely reproduce.',
  },
];
