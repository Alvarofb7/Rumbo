import { describe, expect, it } from 'vitest';
import { parsePlaceLink } from './linkParser';

describe('place link parser', () => {
  it('infers specific food categories and personal tags from link titles', () => {
    expect(parsePlaceLink('https://www.google.com/maps/search/Asador+barato+para+cita')).toMatchObject({
      category: 'grill',
      tags: ['Barato', 'Cita'],
    });
    expect(parsePlaceLink('https://www.google.com/maps/search/Marisqueria+cara')).toMatchObject({
      category: 'seafood',
      tags: ['Caro'],
    });
  });
});
