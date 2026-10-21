// Worker JASSUB yang dipaksa memakai renderer Canvas2D.
//
// Latar belakang: di sebagian kombinasi GPU/driver/browser, kanvas WebGL milik
// JASSUB tampil buram (hitam) sehingga menutupi <video> di preview. Renderer
// Canvas2D memakai libass yang sama (hasil caption identik) tetapi komposisinya
// selalu mendukung alpha, jadi aman sebagai fallback.
//
// Urutan impor penting: patch dievaluasi lebih dulu, baru modul JASSUB.
import './canvas2d-patch.js'
import 'jassub/dist/worker/worker.js'
