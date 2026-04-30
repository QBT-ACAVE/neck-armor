export interface GoatQuote {
  text: string;
  author: 'Michael Jordan' | 'Kobe Bryant';
  topic: 'work ethic' | 'drive' | 'focus' | 'determination';
}

export const GOAT_QUOTES: GoatQuote[] = [
  // Michael Jordan
  {
    text: "I've missed more than 9,000 shots in my career. I've lost almost 300 games. 26 times I've been trusted to take the game-winning shot and missed. I've failed over and over and over again in my life. And that is why I succeed.",
    author: 'Michael Jordan',
    topic: 'determination',
  },
  {
    text: "I can accept failure, everyone fails at something. But I can't accept not trying.",
    author: 'Michael Jordan',
    topic: 'drive',
  },
  {
    text: 'Some people want it to happen, some wish it would happen, others make it happen.',
    author: 'Michael Jordan',
    topic: 'drive',
  },
  {
    text: "If you're trying to achieve, there will be roadblocks. But obstacles don't have to stop you. If you run into a wall, don't turn around and give up. Figure out how to climb it, go through it, or work around it.",
    author: 'Michael Jordan',
    topic: 'determination',
  },
  {
    text: "I've always believed that if you put in the work, the results will come.",
    author: 'Michael Jordan',
    topic: 'work ethic',
  },
  {
    text: 'My attitude is that if you push me towards something that you think is a weakness, then I will turn that perceived weakness into a strength.',
    author: 'Michael Jordan',
    topic: 'drive',
  },
  {
    text: 'You have to expect things of yourself before you can do them.',
    author: 'Michael Jordan',
    topic: 'focus',
  },
  {
    text: 'Limits, like fears, are often just an illusion.',
    author: 'Michael Jordan',
    topic: 'determination',
  },
  {
    text: 'I play to win, whether during practice or a real game.',
    author: 'Michael Jordan',
    topic: 'work ethic',
  },
  {
    text: 'Heart is what separates the good from the great.',
    author: 'Michael Jordan',
    topic: 'drive',
  },
  {
    text: 'Talent wins games, but teamwork and intelligence win championships.',
    author: 'Michael Jordan',
    topic: 'focus',
  },
  {
    text: 'Always turn a negative situation into a positive situation.',
    author: 'Michael Jordan',
    topic: 'determination',
  },
  {
    text: "I've never been afraid to fail.",
    author: 'Michael Jordan',
    topic: 'drive',
  },
  {
    text: 'Step by step, I can\'t see any other way of accomplishing anything.',
    author: 'Michael Jordan',
    topic: 'focus',
  },
  {
    text: 'You must expect great things of yourself before you can do them.',
    author: 'Michael Jordan',
    topic: 'focus',
  },
  {
    text: 'To learn to succeed, you must first learn to fail.',
    author: 'Michael Jordan',
    topic: 'determination',
  },
  {
    text: "I'm not out there sweating for three hours every day just to find out what it feels like to sweat.",
    author: 'Michael Jordan',
    topic: 'work ethic',
  },
  {
    text: 'Be true to the game, because the game will be true to you. If you try to shortcut the game, then the game will shortcut you.',
    author: 'Michael Jordan',
    topic: 'work ethic',
  },

  // Kobe Bryant
  {
    text: 'Mamba mentality is all about focusing on the process and trusting in the hard work when it matters most.',
    author: 'Kobe Bryant',
    topic: 'focus',
  },
  {
    text: 'Great things come from hard work and perseverance. No excuses.',
    author: 'Kobe Bryant',
    topic: 'work ethic',
  },
  {
    text: 'I have nothing in common with lazy people who blame others for their lack of success.',
    author: 'Kobe Bryant',
    topic: 'work ethic',
  },
  {
    text: "I'm chasing perfection.",
    author: 'Kobe Bryant',
    topic: 'drive',
  },
  {
    text: "I'll do whatever it takes to win games, whether it's sitting on a bench waving a towel, handing a cup of water to a teammate, or hitting the game-winning shot.",
    author: 'Kobe Bryant',
    topic: 'determination',
  },
  {
    text: 'Once you know what failure feels like, determination chases success.',
    author: 'Kobe Bryant',
    topic: 'determination',
  },
  {
    text: 'The moment you give up is the moment you let someone else win.',
    author: 'Kobe Bryant',
    topic: 'drive',
  },
  {
    text: 'Everything negative — pressure, challenges — is all an opportunity for me to rise.',
    author: 'Kobe Bryant',
    topic: 'drive',
  },
  {
    text: 'Friends come and go, but banners hang forever.',
    author: 'Kobe Bryant',
    topic: 'focus',
  },
  {
    text: 'Life is too short to get bogged down and be discouraged. You have to keep moving.',
    author: 'Kobe Bryant',
    topic: 'determination',
  },
  {
    text: 'If you do the work, you get rewarded. There are no shortcuts in life.',
    author: 'Kobe Bryant',
    topic: 'work ethic',
  },
  {
    text: "There's a choice that we have to make as people, as individuals. If you want to be great at something, there's a choice you have to make.",
    author: 'Kobe Bryant',
    topic: 'drive',
  },
  {
    text: 'Hard work outweighs talent — every time.',
    author: 'Kobe Bryant',
    topic: 'work ethic',
  },
  {
    text: 'I have self-doubt. I have insecurity. I have fear of failure. We all have self-doubt. You don\'t deny it, but you also don\'t capitulate to it. You embrace it.',
    author: 'Kobe Bryant',
    topic: 'determination',
  },
  {
    text: 'I focus on one thing and one thing only — that\'s trying to win as many championships as I can.',
    author: 'Kobe Bryant',
    topic: 'focus',
  },
  {
    text: 'The most important thing is to try and inspire people so that they can be great in whatever they want to do.',
    author: 'Kobe Bryant',
    topic: 'drive',
  },
  {
    text: 'Dedication makes dreams come true.',
    author: 'Kobe Bryant',
    topic: 'work ethic',
  },
  {
    text: 'It\'s the one thing you can control. You are responsible for how people remember you — or don\'t. So don\'t take it lightly.',
    author: 'Kobe Bryant',
    topic: 'focus',
  },
  {
    text: 'Use your failures as fuel — that\'s what fuels me.',
    author: 'Kobe Bryant',
    topic: 'drive',
  },
  {
    text: 'Boos don\'t block dunks.',
    author: 'Kobe Bryant',
    topic: 'focus',
  },
];

export function randomQuote(seed?: number): GoatQuote {
  const idx =
    seed === undefined
      ? Math.floor(Math.random() * GOAT_QUOTES.length)
      : seed % GOAT_QUOTES.length;
  return GOAT_QUOTES[idx];
}
