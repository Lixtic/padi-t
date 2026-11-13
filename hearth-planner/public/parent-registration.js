/* GuidEd account role selection and parent onboarding.
   Role data is stored server-side through the authenticated account-profile API. */
(function () {
  'use strict';
  var form = document.getElementById('asPanel');
  var P = window.PadiSync;
  if (!form || !P) return;

  var fallbackSubjects = ['Mathematics', 'English Language', 'Science', 'Computing', 'Social Studies', 'Creative Arts', 'Religious and Moral Education'];
  var levels = window.GuidedLevels;
  var wrap = document.createElement('div');
  wrap.id = 'guidedSignupFields';
  wrap.innerHTML =
    '<div class="guided-signup-only" id="guidedSignupOnly" hidden>' +
      '<p class="guided-signup-intro">First, tell us how you will use GuidEd.</p>' +
      '<div class="guided-role-group" role="radiogroup" aria-label="Choose your GuidEd role">' +
        '<label class="guided-role-card"><input type="radio" name="guidedRole" value="parent"><span class="guided-role-icon" aria-hidden="true">🏡</span><strong>I am a Parent</strong><small>Support my child’s learning at home.</small></label>' +
        '<label class="guided-role-card"><input type="radio" name="guidedRole" value="teacher"><span class="guided-role-icon" aria-hidden="true">📚</span><strong>I am a Teacher</strong><small>Prepare lessons and support my learners.</small></label>' +
      '</div>' +
      '<p class="guided-role-error" id="guidedRoleError" role="alert" hidden></p>' +
      '<div class="guided-parent-fields" id="guidedParentFields" hidden>' +
        '<h3>Tell us about your child</h3><p>You can add more children from your Parent Dashboard later.</p>' +
        '<div class="as-field"><label for="guidedChildName">Child’s name or preferred name</label><input id="guidedChildName" type="text" maxlength="80" autocomplete="off" placeholder="e.g. Ama"></div>' +
        '<div class="as-field"><label for="guidedChildClass">Current class</label><select id="guidedChildClass">' +
          Array.from({ length: 9 }, function (_, i) { return '<option value="Basic ' + (i + 1) + '"' + (i === 6 ? ' selected' : '') + '>Basic ' + (i + 1) + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="as-field"><label>Subjects your child studies</label><div class="guided-parent-subjects" id="guidedParentSubjects"></div></div>' +
        '<div class="as-field"><label for="guidedLearningMinutes">Time available for home learning each day</label><select id="guidedLearningMinutes"><option value="15">15 minutes</option><option value="30" selected>30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></div>' +
      '</div>' +
    '</div>' +
    '<div class="as-field guided-signup-only" id="guidedNameField" hidden><label for="guidedDisplayName">Your full name</label><input id="guidedDisplayName" type="text" maxlength="80" autocomplete="name" placeholder="Enter your full name"></div>';
  form.insertBefore(wrap, form.firstElementChild);

  var roleArea = document.getElementById('guidedSignupOnly');
  var roleError = document.getElementById('guidedRoleError');
  var parentFields = document.getElementById('guidedParentFields');
  var nameField = document.getElementById('guidedNameField');
  var nameInput = document.getElementById('guidedDisplayName');
  var childName = document.getElementById('guidedChildName');
  var classInput = document.getElementById('guidedChildClass');
  var minutesInput = document.getElementById('guidedLearningMinutes');
  var subjectBox = document.getElementById('guidedParentSubjects');

  function renderSubjects() {
    var level = levels && levels.levelOfClass(classInput.value);
    var options = level ? level.subjects : fallbackSubjects;
    subjectBox.replaceChildren();
    options.forEach(function (subject, index) {
      var label = document.createElement('label');
      var input = document.createElement('input');
      input.type = 'checkbox'; input.value = subject; input.checked = index < 3;
      var text = document.createElement('span'); text.textContent = subject;
      label.append(input, text); subjectBox.appendChild(label);
    });
  }
  classInput.addEventListener('change', renderSubjects);
  renderSubjects();

  function selectedRole() {
    var checked = form.querySelector('input[name="guidedRole"]:checked');
    return checked ? checked.value : '';
  }
  function isSignup() {
    var tabs = document.getElementById('asTabs');
    return !tabs.hidden && document.getElementById('asTabUp').getAttribute('aria-selected') === 'true';
  }
  function showMode() {
    var up = isSignup();
    roleArea.hidden = !up;
    nameField.hidden = !up;
    if (!up) { roleError.hidden = true; return; }
    parentFields.hidden = selectedRole() !== 'parent';
  }
  form.querySelectorAll('input[name="guidedRole"]').forEach(function (input) {
    input.addEventListener('change', function () { parentFields.hidden = input.value !== 'parent'; roleError.hidden = true; });
  });
  document.getElementById('asTabUp').addEventListener('click', showMode);
  document.getElementById('asTabIn').addEventListener('click', showMode);
  var forgot = document.getElementById('asForgot');
  if (forgot) forgot.addEventListener('click', function () { setTimeout(showMode, 0); });
  var observer = new MutationObserver(showMode);
  observer.observe(document.getElementById('asTabUp'), { attributes: true, attributeFilter: ['aria-selected'] });
  observer.observe(document.getElementById('asTabIn'), { attributes: true, attributeFilter: ['aria-selected'] });

  function collectProfile() {
    var role = selectedRole();
    var profile = { roles: [role], primaryRole: role, displayName: nameInput.value.trim(), children: [] };
    if (role === 'parent') {
      profile.children = [{
        name: childName.value.trim(),
        class: classInput.value,
        subjects: Array.from(subjectBox.querySelectorAll('input:checked')).map(function (input) { return input.value; }),
        minutes: Number(minutesInput.value)
      }];
    }
    return profile;
  }
  function validateRole() {
    var profile = collectProfile();
    if (!profile.roles[0]) return 'Choose whether you are registering as a parent or a teacher.';
    if (!profile.displayName) return 'Enter your full name.';
    if (profile.primaryRole === 'parent') {
      if (!profile.children[0].name) return 'Enter your child’s name.';
      if (!profile.children[0].subjects.length) return 'Select at least one subject for your child.';
    }
    return '';
  }

  form.addEventListener('submit', function (event) {
    if (!isSignup()) return;
    var error = validateRole();
    if (!error) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    roleError.textContent = error;
    roleError.hidden = false;
    (selectedRole() === 'parent' && !childName.value.trim() ? childName : !nameInput.value.trim() ? nameInput : roleArea).focus();
  }, true);

  // Keep a pending profile locally only until the authenticated API confirms it was saved.
  var pendingKey = 'guided.pending-account-profile';
  var baseSignUp = P.signUp.bind(P);
  P.signUp = async function (email, password) {
    var data = collectProfile();
    localStorage.setItem(pendingKey, JSON.stringify({ email: email.toLowerCase(), data: data }));
    var user;
    try { user = await baseSignUp(email, password, data.displayName); }
    catch (error) {
      if (!(error && (error.code === 'verify' || error.created))) localStorage.removeItem(pendingKey);
      throw error;
    }
    await savePending(email);
    return user;
  };

  async function savePending(email) {
    var pending;
    try { pending = JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch (e) { pending = null; }
    if (!pending || (email && pending.email !== String(email).toLowerCase())) return;
    try {
      await P.setAccountProfile(pending.data);
      localStorage.removeItem(pendingKey);
      window.dispatchEvent(new CustomEvent('guided:account-profile-saved', { detail: pending.data }));
    } catch (e) {
      console.warn('[GuidEd account profile] setup will be retried after sign-in:', e && e.message);
      throw new Error('Your account was created, but we could not save your role and child details. Please try signing in again to finish setup.');
    }
  }
  var baseSignIn = P.signIn.bind(P);
  P.signIn = async function (email, password) {
    var user = await baseSignIn(email, password);
    var pending;
    try { pending = JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch (e) { pending = null; }
    if (pending && pending.email === String(email).toLowerCase()) {
      var existing = await P.getAccountProfile();
      if (existing) localStorage.removeItem(pendingKey);
      else await savePending(email);
    }
    return user;
  };

  window.addEventListener('guided:account', function () {
    var user = P.user && P.user();
    if (user) savePending(user.email).catch(function () {});
  });
  showMode();
})();
