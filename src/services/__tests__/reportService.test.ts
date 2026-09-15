import { extractRowPhotoUrls } from '../reportService';

describe('extractRowPhotoUrls', () => {
  it('mengambil dari _photoUrls jika berupa array', () => {
    const row = { _photoUrls: ['url1', 'url2', ''] };
    expect(extractRowPhotoUrls(row)).toEqual(['url1', 'url2']);
  });

  it('mem-parse kolom "Foto URLs" berformat JSON array (format baru)', () => {
    const row = { 'Foto URLs': JSON.stringify(['urlA', 'urlB']) };
    expect(extractRowPhotoUrls(row)).toEqual(['urlA', 'urlB']);
  });

  it('mengabaikan entri kosong/null dalam JSON array', () => {
    const row = { 'Foto URLs': JSON.stringify(['urlA', null, '']) };
    expect(extractRowPhotoUrls(row)).toEqual(['urlA']);
  });

  it('fallback ke kolom lama URL Foto 1/2/3 jika "Foto URLs" bukan JSON valid', () => {
    const row = {
      'Foto URLs': 'bukan-json-valid',
      'URL Foto 1': 'urlOld1',
      'URL Foto 2': 'urlOld2',
      'URL Foto 3': '',
    };
    expect(extractRowPhotoUrls(row)).toEqual(['urlOld1', 'urlOld2']);
  });

  it('fallback ke kolom lama jika "Foto URLs" tidak ada sama sekali', () => {
    const row = { 'URL Foto 1': 'urlOnly' };
    expect(extractRowPhotoUrls(row)).toEqual(['urlOnly']);
  });

  it('mengembalikan array kosong jika tidak ada data foto sama sekali', () => {
    expect(extractRowPhotoUrls({})).toEqual([]);
  });
});
