import { describe, expect, it } from '@jest/globals';

import {
  createShoe,
  dealerShouldHit,
  handValue,
  isBlackjack,
  isBust,
  resolveHands,
  type Card,
} from './blackjackEngine';

function card(rank: Card['rank'], suit: Card['suit'] = 'S'): Card {
  return { rank, suit };
}

describe('createShoe', () => {
  it('builds a full multi-deck shoe', () => {
    expect(createShoe(6)).toHaveLength(6 * 52);
    expect(createShoe(1)).toHaveLength(52);
  });
});

describe('handValue', () => {
  it('adds up simple hands', () => {
    expect(handValue([card('9'), card('7')]).total).toBe(16);
  });

  it('counts a single ace as 11 when it fits', () => {
    const { total, soft } = handValue([card('A'), card('7')]);
    expect(total).toBe(18);
    expect(soft).toBe(true);
  });

  it('downgrades an ace to 1 to avoid busting', () => {
    const { total, soft } = handValue([card('A'), card('9'), card('5')]);
    expect(total).toBe(15);
    expect(soft).toBe(false);
  });

  it('handles two aces correctly', () => {
    expect(handValue([card('A'), card('A')]).total).toBe(12);
  });
});

describe('isBlackjack', () => {
  it('recognizes a natural 21 on the first two cards', () => {
    expect(isBlackjack([card('A'), card('K')])).toBe(true);
  });

  it('does not count a 3-card 21 as blackjack', () => {
    expect(isBlackjack([card('7'), card('7'), card('7')])).toBe(false);
  });
});

describe('isBust', () => {
  it('flags totals over 21', () => {
    expect(isBust([card('K'), card('Q'), card('5')])).toBe(true);
  });

  it('does not flag totals of 21 or under', () => {
    expect(isBust([card('K'), card('Q')])).toBe(false);
  });
});

describe('dealerShouldHit', () => {
  it('hits below 17', () => {
    expect(dealerShouldHit([card('9'), card('6')])).toBe(true);
  });

  it('stands on hard 17', () => {
    expect(dealerShouldHit([card('10'), card('7')])).toBe(false);
  });

  it('stands on soft 17', () => {
    expect(dealerShouldHit([card('A'), card('6')])).toBe(false);
  });
});

describe('resolveHands', () => {
  it('both blackjack is a push', () => {
    expect(resolveHands([card('A'), card('K')], [card('A'), card('Q')])).toBe('push');
  });

  it('player blackjack beats a dealer non-blackjack 21', () => {
    expect(resolveHands([card('A'), card('K')], [card('7'), card('7'), card('7')])).toBe(
      'player-blackjack'
    );
  });

  it('dealer blackjack beats a player non-blackjack hand', () => {
    expect(resolveHands([card('9'), card('9')], [card('A'), card('K')])).toBe('dealer-blackjack');
  });

  it('player bust is a loss regardless of dealer hand', () => {
    expect(resolveHands([card('K'), card('Q'), card('5')], [card('9'), card('6')])).toBe('loss');
  });

  it('dealer bust with player standing is a win', () => {
    expect(resolveHands([card('9'), card('8')], [card('K'), card('Q'), card('5')])).toBe('win');
  });

  it('higher total wins when both stand', () => {
    expect(resolveHands([card('10'), card('9')], [card('10'), card('8')])).toBe('win');
    expect(resolveHands([card('10'), card('8')], [card('10'), card('9')])).toBe('loss');
  });

  it('equal totals push', () => {
    expect(resolveHands([card('10'), card('9')], [card('K'), card('9')])).toBe('push');
  });
});
