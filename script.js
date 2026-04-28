/*
 * Валідація, маска телефону, відправка форми
 */
(function () {
  'use strict';

  var form      = document.getElementById('leadForm');
  var fname     = document.getElementById('fname');
  var lname     = document.getElementById('lname');
  var email     = document.getElementById('email');
  var phone     = document.getElementById('phone');
  var honeypot  = document.getElementById('website');
  var submitBtn = document.getElementById('submitBtn');
  var overlay   = document.getElementById('successOverlay');
  var closeBtn  = document.getElementById('closeSuccess');

  var errEls = {
    fname: document.getElementById('fnameError'),
    lname: document.getElementById('lnameError'),
    email: document.getElementById('emailError'),
    phone: document.getElementById('phoneError')
  };

  // --- хелпери ---
  function showErr(id, msg) {
    errEls[id].textContent = msg;
    document.getElementById(id).classList.add('error');
    document.getElementById(id).classList.remove('valid');
  }
  function clearErr(id) {
    errEls[id].textContent = '';
    document.getElementById(id).classList.remove('error');
  }
  function setValid(id) {
    clearErr(id);
    document.getElementById(id).classList.add('valid');
  }

  // --- регулярки ---
  var nameRe  = /^[a-zA-ZáàâäãåéèêëíìîïóòôöõúùûüñçÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇ\s'-]{2,50}$/;
  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var phoneRe = /^\+?\d[\d\s\-()]{6,18}\d$/;

  function checkFname() {
    var v = fname.value.trim();
    if (!v)              { showErr('fname', 'El nombre es obligatorio'); return false; }
    if (!nameRe.test(v)) { showErr('fname', 'Nombre no válido (mín. 2 caracteres)'); return false; }
    setValid('fname'); return true;
  }
  function checkLname() {
    var v = lname.value.trim();
    if (!v)              { showErr('lname', 'El apellido es obligatorio'); return false; }
    if (!nameRe.test(v)) { showErr('lname', 'Apellido no válido (mín. 2 caracteres)'); return false; }
    setValid('lname'); return true;
  }
  function checkEmail() {
    var v = email.value.trim();
    if (!v)               { showErr('email', 'El correo electrónico es obligatorio'); return false; }
    if (!emailRe.test(v)) { showErr('email', 'Introduce un correo válido'); return false; }
    setValid('email'); return true;
  }
  function checkPhone() {
    var v = phone.value.trim();
    if (!v) { showErr('phone', 'El teléfono es obligatorio'); return false; }
    var d = v.replace(/\D/g, '');
    if (d.length < 7 || d.length > 15 || !phoneRe.test(v)) {
      showErr('phone', 'Formato inválido. Ej: +34 600 000 000');
      return false;
    }
    setValid('phone'); return true;
  }

  // --- маска телефону ---
  phone.addEventListener('input', function () {
    var val = this.value;
    if (val.length === 1 && val !== '+') val = '+' + val;

    var prefix = val.startsWith('+') ? '+' : '';
    var digits = val.replace(/\D/g, '');
    var out = prefix;

    if (digits.length > 0) out += digits.substring(0, 2);
    if (digits.length > 2) out += ' ' + digits.substring(2, 5);
    if (digits.length > 5) out += ' ' + digits.substring(5, 8);
    if (digits.length > 8) out += ' ' + digits.substring(8, 12);

    this.value = out;
  });

  phone.addEventListener('keydown', function (e) {
    var ok = [8, 9, 13, 27, 37, 38, 39, 40, 46];
    if (ok.indexOf(e.keyCode) !== -1) return;
    if (e.key === '+' && this.value.length === 0) return;
    if ((e.ctrlKey || e.metaKey) && [65, 67, 86, 88].indexOf(e.keyCode) !== -1) return;
    if (e.key && e.key.length === 1 && !/\d/.test(e.key)) e.preventDefault();
  });

  // --- blur-валідація ---
  fname.addEventListener('blur', checkFname);
  lname.addEventListener('blur', checkLname);
  email.addEventListener('blur', checkEmail);
  phone.addEventListener('blur', checkPhone);

  [fname, lname, email, phone].forEach(function (el) {
    el.addEventListener('input', function () { clearErr(el.id); });
  });

  // --- відправка ---
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    // honeypot
    if (honeypot && honeypot.value) { showSuccess(); return; }

    var ok = checkFname() & checkLname() & checkEmail() & checkPhone();
    if (!ok) {
      var first = form.querySelector('.error');
      if (first) first.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add('loading');

    var fd = new FormData();
    fd.append('fname', fname.value.trim());
    fd.append('lname', lname.value.trim());
    fd.append('email', email.value.trim());
    fd.append('phone', phone.value.trim());
    fd.append('website', honeypot ? honeypot.value : '');

    fetch('send.php', { method: 'POST', body: fd })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success) {
          showSuccess(data.redirect_url);
        } else {
          alert(data.message || 'Error. Inténtalo de nuevo.');
        }
      })
      .catch(function (err) {
        // якщо PHP недоступний — для демо показуємо успіх
        console.warn('send.php unavailable (expected in non-PHP environments):', err.message);
        showSuccess();
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
      });
  });

  // --- модалка успіху ---
  function showSuccess(url) {
    overlay.classList.add('active');
    form.reset();
    document.querySelectorAll('.valid').forEach(function (el) { el.classList.remove('valid'); });
    if (url) setTimeout(function () { window.location.href = url; }, 4000);
  }

  closeBtn.addEventListener('click', function () { overlay.classList.remove('active'); });
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) overlay.classList.remove('active');
  });

  // --- таймер зворотнього відліку ---
  (function () {
    var deadline = new Date();
    deadline.setHours(23, 59, 59, 0);

    function tick() {
      var diff = deadline - new Date();
      if (diff <= 0) diff = 0;
      var h = Math.floor(diff / 3600000);
      var m = Math.floor((diff % 3600000) / 60000);
      var s = Math.floor((diff % 60000) / 1000);
      document.getElementById('cdHours').textContent   = (h < 10 ? '0' : '') + h;
      document.getElementById('cdMinutes').textContent = (m < 10 ? '0' : '') + m;
      document.getElementById('cdSeconds').textContent = (s < 10 ? '0' : '') + s;
    }
    tick();
    setInterval(tick, 1000);
  })();

  // --- дата у хедері ---
  (function () {
    var now = new Date();
    var str = now.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    var d1 = document.getElementById('headerDate');
    var d2 = document.getElementById('articleDate');
    if (d1) d1.textContent = str;
    if (d2) d2.textContent = str;
  })();

})();
