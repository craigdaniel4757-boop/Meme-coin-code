/* Equity Trends Valuations Inc. — site scripts */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Header state & back-to-top ---------- */
  var header = document.querySelector('[data-header]');
  var toTop = document.querySelector('[data-to-top]');

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (header) header.classList.toggle('is-scrolled', y > 8);
    if (toTop) toTop.classList.toggle('is-visible', y > 900);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }

  /* ---------- Mobile navigation ---------- */
  var toggle = document.querySelector('[data-nav-toggle]');
  var mobileNav = document.getElementById('mobile-nav');

  function setNav(open) {
    if (!toggle || !mobileNav) return;
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (open) {
      mobileNav.removeAttribute('inert');
      mobileNav.removeAttribute('aria-hidden');
    } else {
      mobileNav.setAttribute('inert', '');
      mobileNav.setAttribute('aria-hidden', 'true');
    }
  }

  if (toggle && mobileNav) {
    toggle.addEventListener('click', function () {
      setNav(toggle.getAttribute('aria-expanded') !== 'true');
    });
    mobileNav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setNav(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('nav-open')) {
        setNav(false);
        toggle.focus();
      }
    });
    window.matchMedia('(min-width: 1081px)').addEventListener('change', function (mq) {
      if (mq.matches) setNav(false);
    });
  }

  /* Close desktop dropdown with Escape */
  document.querySelectorAll('.nav-item').forEach(function (item) {
    item.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var link = item.querySelector('.nav-link');
        if (document.activeElement && item.contains(document.activeElement)) {
          document.activeElement.blur();
        }
        if (link) link.focus();
        item.classList.add('is-dismissed');
      }
    });
    item.addEventListener('mouseleave', function () {
      item.classList.remove('is-dismissed');
    });
    item.addEventListener('focusout', function (e) {
      if (!item.contains(e.relatedTarget)) item.classList.remove('is-dismissed');
    });
  });

  /* ---------- Reveal on scroll ---------- */
  var revealEls = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.06 }
    );
    revealEls.forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add('is-visible');
    });
  }

  /* ---------- Section scrollspy (side navigation) ---------- */
  var spyNav = document.querySelector('[data-scrollspy]');
  if (spyNav && 'IntersectionObserver' in window) {
    var spyLinks = Array.prototype.slice.call(spyNav.querySelectorAll('a[href^="#"]'));
    var sections = spyLinks
      .map(function (a) {
        return document.getElementById(a.getAttribute('href').slice(1));
      })
      .filter(Boolean);

    var setActive = function (id) {
      spyLinks.forEach(function (a) {
        var on = a.getAttribute('href') === '#' + id;
        a.classList.toggle('is-active', on);
        if (on) {
          a.setAttribute('aria-current', 'true');
          // keep the active chip visible on the horizontal (mobile) bar
          if (spyNav.scrollWidth > spyNav.clientWidth) {
            spyNav.scrollTo({ left: a.offsetLeft - 16, behavior: reduceMotion ? 'auto' : 'smooth' });
          }
        } else {
          a.removeAttribute('aria-current');
        }
      });
    };

    var spyObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 }
    );
    sections.forEach(function (s) {
      spyObserver.observe(s);
    });
    if (sections[0]) setActive(sections[0].id);
  }

  /* ---------- Quote carousel ---------- */
  var carousel = document.querySelector('[data-carousel]');
  if (carousel) {
    var slides = Array.prototype.slice.call(carousel.querySelectorAll('[data-slide]'));
    var dots = Array.prototype.slice.call(carousel.querySelectorAll('[data-dot]'));
    var index = 0;
    var timer = null;

    var go = function (i) {
      index = (i + slides.length) % slides.length;
      slides.forEach(function (s, n) {
        var on = n === index;
        s.classList.toggle('is-active', on);
        s.setAttribute('aria-hidden', String(!on));
      });
      dots.forEach(function (d, n) {
        d.setAttribute('aria-current', n === index ? 'true' : 'false');
      });
    };
    var stop = function () {
      if (timer) clearInterval(timer);
      timer = null;
    };
    var start = function () {
      if (reduceMotion || slides.length < 2) return;
      stop();
      timer = setInterval(function () {
        go(index + 1);
      }, 7000);
    };

    var prev = carousel.querySelector('[data-prev]');
    var next = carousel.querySelector('[data-next]');
    if (prev) prev.addEventListener('click', function () { go(index - 1); start(); });
    if (next) next.addEventListener('click', function () { go(index + 1); start(); });
    dots.forEach(function (d, n) {
      d.addEventListener('click', function () { go(n); start(); });
    });
    carousel.addEventListener('mouseenter', stop);
    carousel.addEventListener('mouseleave', start);
    carousel.addEventListener('focusin', stop);
    carousel.addEventListener('focusout', start);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else start();
    });
    go(0);
    start();
  }

  /* ---------- FAQ accordion ---------- */
  var faqs = Array.prototype.slice.call(document.querySelectorAll('details.faq'));

  function openFromHash() {
    var id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    var target = document.getElementById(id);
    if (target && target.matches('details.faq')) {
      target.open = true;
      requestAnimationFrame(function () {
        target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      });
    }
  }
  if (faqs.length) {
    openFromHash();
    window.addEventListener('hashchange', openFromHash);

    var toggleAll = document.querySelector('[data-faq-toggle]');
    if (toggleAll) {
      var syncLabel = function () {
        var allOpen = faqs.every(function (f) { return f.open; });
        toggleAll.textContent = allOpen ? 'Collapse all' : 'Expand all';
        toggleAll.setAttribute('aria-expanded', String(allOpen));
      };
      toggleAll.addEventListener('click', function () {
        var allOpen = faqs.every(function (f) { return f.open; });
        faqs.forEach(function (f) { f.open = !allOpen; });
        syncLabel();
      });
      faqs.forEach(function (f) {
        f.addEventListener('toggle', syncLabel);
      });
      syncLabel();
    }
  }

  /* ---------- Contact form ---------- */
  var form = document.querySelector('[data-contact-form]');
  if (form) {
    var params = new URLSearchParams(window.location.search);
    var serviceParam = params.get('service');
    var subjectParam = params.get('subject');
    var serviceSelect = form.elements.namedItem('service');
    var subjectInput = form.elements.namedItem('subject');

    if (serviceParam && serviceSelect) {
      var match = Array.prototype.some.call(serviceSelect.options, function (o) {
        return o.value === serviceParam;
      });
      if (match) serviceSelect.value = serviceParam;
    }
    if (subjectParam && subjectInput) subjectInput.value = subjectParam.slice(0, 140);

    var status = form.querySelector('[data-form-status]');
    var submitBtn = form.querySelector('[type="submit"]');
    var recipient = form.getAttribute('data-recipient');
    var endpoint = (form.getAttribute('data-endpoint') || '').trim();
    var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    var rules = {
      name: function (v) { return v.trim().length >= 2 ? '' : 'Please enter your name.'; },
      email: function (v) {
        if (!v.trim()) return 'Please enter your email address.';
        return emailPattern.test(v.trim()) ? '' : 'Please enter a valid email address.';
      },
      message: function (v) {
        return v.trim().length >= 10 ? '' : 'Please include a short message (at least 10 characters).';
      },
      consent: function (v, el) { return el.checked ? '' : 'Please confirm to continue.'; }
    };

    var setError = function (name, msg) {
      var el = form.elements.namedItem(name);
      var err = form.querySelector('[data-error-for="' + name + '"]');
      if (!el) return;
      if (msg) el.setAttribute('aria-invalid', 'true');
      else el.removeAttribute('aria-invalid');
      if (err) err.textContent = msg;
    };

    var validateField = function (name) {
      var el = form.elements.namedItem(name);
      if (!el || !rules[name]) return true;
      var msg = rules[name](el.value || '', el);
      setError(name, msg);
      return !msg;
    };

    var validate = function () {
      var firstInvalid = null;
      Object.keys(rules).forEach(function (name) {
        if (!validateField(name) && !firstInvalid) firstInvalid = form.elements.namedItem(name);
      });
      if (firstInvalid) firstInvalid.focus();
      return !firstInvalid;
    };

    Object.keys(rules).forEach(function (name) {
      var el = form.elements.namedItem(name);
      if (!el) return;
      el.addEventListener('blur', function () {
        if (el.type !== 'checkbox' && el.value) validateField(name);
      });
      el.addEventListener('input', function () {
        if (el.getAttribute('aria-invalid') === 'true') validateField(name);
      });
      el.addEventListener('change', function () {
        if (el.type === 'checkbox') validateField(name);
      });
    });

    var showStatus = function (type, html) {
      status.className = 'form-status is-' + type;
      status.innerHTML = html;
      status.focus();
    };

    var escapeHtml = function (s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    };

    var fallbackHtml =
      'You can also reach us directly at <a href="mailto:' + recipient + '">' + recipient +
      '</a> or <a href="tel:+14164320141">416.432.0141</a>.';

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate()) return;

      var hp = form.elements.namedItem('_gotcha');
      if (hp && hp.value) return; // bot trap

      var get = function (n) {
        var el = form.elements.namedItem(n);
        return el ? String(el.value || '').trim() : '';
      };
      var serviceLabel = serviceSelect ? serviceSelect.options[serviceSelect.selectedIndex].text : 'General enquiry';
      var subject = get('subject') || 'Website enquiry: ' + serviceLabel;

      if (endpoint) {
        submitBtn.classList.add('is-loading');
        submitBtn.setAttribute('aria-busy', 'true');
        var data = new FormData(form);
        data.set('subject', subject);
        data.set('service', serviceLabel);
        fetch(endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } })
          .then(function (res) {
            if (!res.ok) throw new Error('Request failed');
            form.reset();
            showStatus('success', '<strong>Thank you, your enquiry has been sent.</strong> We will respond as soon as possible.');
          })
          .catch(function () {
            showStatus('error', '<strong>Sorry, your message could not be sent.</strong> ' + fallbackHtml);
          })
          .finally(function () {
            submitBtn.classList.remove('is-loading');
            submitBtn.removeAttribute('aria-busy');
          });
        return;
      }

      // No form service configured: hand the message to the visitor's email app.
      var lines = [
        'Name: ' + get('name'),
        'Email: ' + get('email')
      ];
      if (get('phone')) lines.push('Phone: ' + get('phone'));
      if (get('company')) lines.push('Company: ' + get('company'));
      lines.push('Service: ' + serviceLabel, '', get('message'));

      var href = 'mailto:' + recipient +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(lines.join('\r\n'));
      window.location.href = href;

      showStatus(
        'success',
        '<strong>Almost done, ' + escapeHtml(get('name').split(' ')[0]) + '.</strong> ' +
        'Your email app should now open with your message ready to send. If it did not, ' + fallbackHtml.charAt(0).toLowerCase() + fallbackHtml.slice(1)
      );
    });
  }

  /* ---------- Footer year ---------- */
  var year = String(new Date().getFullYear());
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = year;
  });
})();
