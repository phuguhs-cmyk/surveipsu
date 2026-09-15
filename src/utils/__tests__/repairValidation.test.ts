import { validateRepairDamageDimensions } from '../repairValidation';

describe('validateRepairDamageDimensions', () => {
  it('rejects road damage values larger than the surveyed segment', () => {
    const result = validateRepairDamageDimensions({
      length: '20',
      staStart: '0+000',
      staEnd: '0+020',
      widthStart: '3',
      widthEnd: '4',
      damageLength: '25',
      damageWidth: '5',
      damageDepth: '25',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'Panjang kerusakan tidak boleh melebihi panjang segmen yang disurvei.',
      'Lebar kerusakan tidak boleh melebihi lebar segmen yang disurvei.',
      'Tinggi/kedalaman kerusakan tidak boleh melebihi dimensi segmen yang disurvei.',
    ]));
  });

  it('accepts damage values within the segment boundaries', () => {
    const result = validateRepairDamageDimensions({
      length: '20',
      staStart: '0+000',
      staEnd: '0+020',
      widthStart: '3',
      widthEnd: '4',
      damageLength: '10',
      damageWidth: '2.5',
      damageDepth: '3',
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
