/*
 * Konfigurasi IziLearning.
 * Biasanya tidak perlu diubah. Secara default game memakai server sinyal
 * PeerJS publik yang gratis (0.peerjs.com) hanya untuk "mempertemukan"
 * laptop guru dan HP murid. Setelah terhubung, data soal & jawaban
 * dikirim langsung antar perangkat (peer-to-peer), tidak disimpan di server.
 */
window.IZI_CONFIG = {
  APP_NAME: 'IziLearning',

  // Awalan ID peer supaya kode room tidak bentrok dengan aplikasi lain.
  PEER_PREFIX: 'izilearning-v1-',

  // Isi jika ingin memakai server PeerJS sendiri, contoh:
  // { host: 'peer.sekolahku.sch.id', port: 443, path: '/', secure: true }
  PEER_SERVER: null,

  // Isi jika ingin memakai STUN/TURN sendiri. null = pakai bawaan PeerJS.
  ICE_SERVERS: null,

  // Batas murid per room.
  MAX_PLAYERS: 40,

  // Nilai minimal kelulusan (KKM) bawaan.
  DEFAULT_KKM: 75,
};
