import { describe, expect, it } from 'vitest';

import {
  dealerShouldDraw,
  handValue,
  isBlackjack,
  isBust,
  legalActions,
  newShoe,
  payoutFor,
  settleHand,
  shuffle,
  type Card,
  type HandOutcome,
} from '../src/blackjack/engine.ts';

describe('handValue', () => {
  it('sums hard hands', () => {
    expect(handValue(['2S', '3H'])).toEqual({ total: 5, soft: false });
    expect(handValue(['TS', '9H'])).toEqual({ total: 19, soft: false });
    expect(handValue(['TS', 'JH', 'QD'])).toEqual({ total: 30, soft: false });
  });

  it('counts all face cards and tens as 10', () => {
    for (const r of ['T', 'J', 'Q', 'K']) {
      expect(handValue([`${r}S`, '5H']).total).toBe(15);
    }
  });

  it('promotes one ace to 11 when it fits', () => {
    expect(handValue(['AS', '6H'])).toEqual({ total: 17, soft: true });
    expect(handValue(['AS', 'KH'])).toEqual({ total: 21, soft: true });
    expect(handValue(['AS', 'AH'])).toEqual({ total: 12, soft: true }); // 11 + 1, never 22
    expect(handValue(['AS', 'AH', '9D'])).toEqual({ total: 21, soft: true });
  });

  it('demotes the ace to 1 when 11 would bust', () => {
    expect(handValue(['AS', '6H', '9D'])).toEqual({ total: 16, soft: false });
    expect(handValue(['AS', 'KH', 'QD'])).toEqual({ total: 21, soft: false });
    expect(handValue(['AS', 'AH', 'AD', 'AC'])).toEqual({ total: 14, soft: true });
    expect(handValue(['AS', 'AH', 'KD', 'QD'])).toEqual({ total: 22, soft: false }); // bust
  });

  it('rejects malformed cards', () => {
    expect(() => handValue(['1S'])).toThrow(/bad card/);
    expect(() => handValue(['XS'])).toThrow(/bad card/);
  });
});

describe('isBlackjack / isBust', () => {
  it('blackjack is exactly two cards totalling 21', () => {
    expect(isBlackjack(['AS', 'KH'])).toBe(true);
    expect(isBlackjack(['AS', 'TD'])).toBe(true);
    expect(isBlackjack(['KH', 'AS'])).toBe(true);
    expect(isBlackjack(['7S', '7H', '7D'])).toBe(false); // drawn 21 is not a natural
    expect(isBlackjack(['AS', '9H'])).toBe(false);
  });

  it('bust is over 21 with the best ace treatment', () => {
    expect(isBust(['TS', 'TH', '2D'])).toBe(true);
    expect(isBust(['TS', 'TH'])).toBe(false);
    expect(isBust(['AS', 'TH', 'TD'])).toBe(false); // ace drops to 1: 21
    expect(isBust(['AS', 'AH', 'TD', 'TC'])).toBe(true); // 22 at best
  });
});

describe('dealer behaviour', () => {
  it('draws below 17', () => {
    expect(dealerShouldDraw(['TS', '6H'])).toBe(true); // 16
    expect(dealerShouldDraw(['2S', '2H'])).toBe(true);
    expect(dealerShouldDraw(['AS', '5H'])).toBe(true); // soft 16
  });

  it('stands on all 17s, soft included', () => {
    expect(dealerShouldDraw(['TS', '7H'])).toBe(false); // hard 17
    expect(dealerShouldDraw(['AS', '6H'])).toBe(false); // soft 17
    expect(dealerShouldDraw(['TS', 'TH'])).toBe(false);
    expect(dealerShouldDraw(['AS', 'KH'])).toBe(false);
  });
});

describe('legalActions', () => {
  it('offers hit/stand/double on the first two cards', () => {
    expect(legalActions(['TS', '5H'], false).sort()).toEqual(['double', 'hit', 'stand']);
  });

  it('drops double after the third card', () => {
    expect(legalActions(['2S', '3H', '4D'], false).sort()).toEqual(['hit', 'stand']);
  });

  it('is empty on 21, blackjack, bust, and doubled hands', () => {
    expect(legalActions(['AS', 'KH'], false)).toEqual([]);
    expect(legalActions(['7S', '7H', '7D'], false)).toEqual([]);
    expect(legalActions(['TS', 'TH', '5D'], false)).toEqual([]);
    expect(legalActions(['TS', '5H', '4D'], true)).toEqual([]); // doubled = done
  });
});

describe('settleHand', () => {
  const cases: [Card[], Card[], HandOutcome, string][] = [
    [['TS', 'TH', '5D'], ['TS', 'TH', '5C'], 'BUST', 'player bust loses even when dealer busts'],
    [['TS', 'TH', '5D'], ['TD', '7C'], 'BUST', 'plain bust'],
    [['AS', 'KH'], ['AD', 'KC'], 'PUSH', 'blackjack vs blackjack'],
    [['AS', 'KH'], ['7D', '7C', '7H'], 'BLACKJACK', 'natural beats a drawn 21'],
    [['7S', '7H', '7D'], ['AD', 'KC'], 'LOSS', 'drawn 21 loses to a natural'],
    [['AS', 'KH'], ['TD', '9C'], 'BLACKJACK', 'natural vs 19'],
    [['5S', '7H'], ['TD', '6C', 'KC'], 'WIN', 'dealer bust, live hand wins'],
    [['TS', 'TH'], ['TD', '9C'], 'WIN', '20 beats 19'],
    [['TS', '9H'], ['TD', '9C'], 'PUSH', '19 ties 19'],
    [['TS', '7H'], ['TD', '9C'], 'LOSS', '17 loses to 19'],
    [['AS', '6H'], ['TD', '7C'], 'PUSH', 'soft 17 ties hard 17'],
  ];

  for (const [player, dealer, outcome, label] of cases) {
    it(label, () => expect(settleHand(player, dealer)).toBe(outcome));
  }
});

describe('payoutFor', () => {
  // Minor units at 1e4: 100.0000 tokens = 1_000_000n.
  const wager = 1_000_000n;

  it('pays the table of multiples', () => {
    expect(payoutFor('WIN', wager)).toBe(2_000_000n); // 2x total
    expect(payoutFor('BLACKJACK', wager)).toBe(2_500_000n); // 2.5x
    expect(payoutFor('PUSH', wager)).toBe(wager); // stake back
    expect(payoutFor('LOSS', wager)).toBe(0n);
    expect(payoutFor('BUST', wager)).toBe(0n);
  });

  it('floors the blackjack half-unit toward the house', () => {
    expect(payoutFor('BLACKJACK', 1n)).toBe(2n); // 2.5 floored
    expect(payoutFor('BLACKJACK', 2n)).toBe(5n); // exact
  });

  it('rejects non-positive wagers', () => {
    expect(() => payoutFor('WIN', 0n)).toThrow();
    expect(() => payoutFor('WIN', -1n)).toThrow();
  });
});

describe('shoe and shuffle', () => {
  it('builds 52 unique cards per deck', () => {
    const one = newShoe(1);
    expect(one).toHaveLength(52);
    expect(new Set(one).size).toBe(52);
    expect(newShoe(6)).toHaveLength(312);
  });

  it('shuffle is a permutation — same multiset, nothing minted or lost', () => {
    const original = newShoe(6);
    const shuffled = shuffle([...original]);
    expect(shuffled).toHaveLength(original.length);
    expect([...shuffled].sort()).toEqual([...original].sort());
  });

  it('shuffle actually moves cards (312! makes a fixed-point run absurd)', () => {
    const original = newShoe(6);
    const shuffled = shuffle([...original]);
    const moved = shuffled.filter((c, i) => c !== original[i]).length;
    expect(moved).toBeGreaterThan(200); // expected fixed points ≈ 1
  });
});
