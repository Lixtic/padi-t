// Installed app / home-screen launches go straight to the app host; everyone else sees the landing page.
(function () {
  var APP = 'https://app.guidedgh.site';
  if (location.hostname === 'app.guidedgh.site') return;
  var planClass = document.getElementById('heroPlanClass');
  var planSubject = document.getElementById('heroPlanSubject');
  if (planClass && planSubject) {
    var subjectSets = {
      kg: ['Integrated Learning'],
      lower: ['English Language', 'Mathematics', 'Ghanaian Language', 'Science', 'Our World Our People', 'History', 'Creative Arts', 'Religious and Moral Education', 'Physical Education', 'Computing'],
      upper: ['English Language', 'Mathematics', 'Science', 'Our World Our People', 'History', 'Computing', 'Creative Arts', 'Religious and Moral Education', 'Physical Education', 'Ghanaian Language', 'French'],
      jhs: ['Integrated Science', 'Mathematics', 'English Language', 'Social Studies', 'Religious and Moral Education', 'Computing', 'Career Technology', 'Creative Arts and Design', 'Ghanaian Language', 'French', 'Physical Education and Health'],
      shs: ['English Language', 'Mathematics', 'General Science', 'Social Studies']
    };
    function updatePlanSubjects() {
      var cls = planClass.value;
      var level = /^KG/.test(cls) ? 'kg' : /^Basic [123]$/.test(cls) ? 'lower' : /^Basic [456]$/.test(cls) ? 'upper' : /^Basic [789]$/.test(cls) ? 'jhs' : 'shs';
      var choices = subjectSets[level] || [];
      var previous = planSubject.value;
      planSubject.replaceChildren();
      choices.forEach(function (subject) {
        var option = document.createElement('option');
        option.value = subject; option.textContent = subject; planSubject.appendChild(option);
      });
      planSubject.value = choices.includes(previous) ? previous : choices[0];
    }
    planClass.addEventListener('change', updatePlanSubjects);
    updatePlanSubjects();
  }

  var standalone = false;
  try { standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch (e) {}
  if (standalone || /[?&]source=pwa\b/.test(location.search)) location.replace(APP + '/?source=pwa');
})();
