/* GuidEd Family illustration library.
   Small, reusable inline vector scenes; no external image requests or third-party assets. */
(function (root) {
  'use strict';
  var scenes = {
    'family-reading': {
      label: 'A parent and child enjoying a book together',
      body: '<ellipse cx="180" cy="127" rx="150" ry="100" fill="#F9E8D5"/><circle cx="77" cy="61" r="18" fill="#F5C66B" opacity=".7"/><path d="M35 183c26-28 49-34 73-26 22 8 35 24 45 47H35z" fill="#DCEFE5"/><path d="M225 204c17-29 43-45 76-41 16 2 27 11 37 23v28H225z" fill="#E1EAFE"/><path d="M86 197c-6-34 2-65 23-83 13-11 31-14 48-8 20 7 29 27 27 51l-5 48z" fill="#A95E43"/><path d="M91 121c-5-31 10-54 37-59 28-5 49 13 49 43-8-7-17-12-29-13-18-1-34 9-42 27z" fill="#302321"/><circle cx="139" cy="113" r="28" fill="#8B513B"/><path d="M111 108c3-27 20-40 41-35 16 4 25 18 25 35-12-8-23-12-35-11-12 1-22 5-31 11z" fill="#302321"/><path d="M108 147c-16 12-25 31-27 56h99c-1-25-10-44-28-56z" fill="#E8A17D"/><path d="M212 199c-7-27-1-52 17-68 12-11 30-13 46-6 18 8 25 26 22 49l-3 25z" fill="#4D7BBF"/><circle cx="253" cy="123" r="25" fill="#A9674D"/><path d="M229 119c-2-25 12-42 34-42 20 0 34 17 33 41-10-9-21-13-34-12-12 0-23 5-33 13z" fill="#25201F"/><path d="M228 151c-14 11-21 27-22 49h94c-2-22-10-39-25-49z" fill="#5D91D2"/><path d="M157 164q30-21 59 0l-8 36h-43z" fill="#FFF9EF" stroke="#D7B99B" stroke-width="2"/><path d="M165 165l-2 34m46-34 3 34" stroke="#D7B99B" stroke-width="2"/><path d="M158 162q29-14 58 0" fill="none" stroke="#D7B99B" stroke-width="3"/><path d="M190 157l10 8 9-8" fill="none" stroke="#E2A94F" stroke-width="3" stroke-linecap="round"/><path d="M62 95l5 11 11 5-11 5-5 11-5-11-11-5 11-5zM310 60l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="#E6B34F"/><path d="M297 155l4 8 8 4-8 4-4 8-4-8-8-4 8-4z" fill="#E9A17D"/>'
    },
    'book-sprout': {
      label: 'An open book with a growing sprout',
      body: '<ellipse cx="180" cy="192" rx="126" ry="20" fill="#DCEFE5"/><circle cx="180" cy="105" r="76" fill="#F9E8D5"/><path d="M180 174c-34-24-74-25-105-12v53c35-12 73-9 105 13 32-22 70-25 105-13v-53c-31-13-71-12-105 12z" fill="#FFFDF8" stroke="#D8B99A" stroke-width="4" stroke-linejoin="round"/><path d="M180 174v54M91 177c25-8 52-7 76 3m-76 10c24-7 51-6 76 3m102-16c-25-8-52-7-76 3m76 10c-24-7-51-6-76 3" fill="none" stroke="#C9D7E8" stroke-width="3" stroke-linecap="round"/><path d="M180 171v-51" stroke="#4C9A72" stroke-width="6" stroke-linecap="round"/><path d="M180 143c-29-2-42-18-40-38 22-2 40 10 40 38zM181 127c2-28 19-42 42-40 2 22-12 40-42 40z" fill="#73B987" stroke="#4C9A72" stroke-width="2"/><circle cx="90" cy="83" r="7" fill="#E6B34F"/><circle cx="267" cy="78" r="5" fill="#E8A17D"/><path d="M276 123l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="#E6B34F"/>'
    },
    'learning-together': {
      label: 'A child learning with a caring adult',
      body: '<ellipse cx="180" cy="188" rx="142" ry="22" fill="#E2EAFE"/><circle cx="180" cy="111" r="88" fill="#F9E8D5"/><rect x="64" y="177" width="232" height="25" rx="12" fill="#D4A16D"/><path d="M91 177v28m178-28v28" stroke="#B57D4B" stroke-width="7" stroke-linecap="round"/><circle cx="133" cy="104" r="30" fill="#8B513B"/><path d="M104 100c-2-28 14-46 38-45 23 1 36 19 33 44-10-11-22-16-37-15-13 1-24 7-34 16z" fill="#302321"/><path d="M103 143c-17 8-25 21-27 39h112c-2-19-11-32-28-39z" fill="#E8A17D"/><circle cx="228" cy="121" r="24" fill="#A9674D"/><path d="M204 117c0-24 14-39 34-38 20 1 31 16 29 38-8-8-18-12-31-11-12 0-23 4-32 11z" fill="#25201F"/><path d="M202 153c-14 8-20 18-22 29h94c-2-13-10-24-23-29z" fill="#4D7BBF"/><path d="M145 158q35-22 69 0l-5 29h-59z" fill="#FFFDF8" stroke="#D8B99A" stroke-width="3"/><path d="M180 159v28" stroke="#D8B99A" stroke-width="2"/><path d="M62 91l5 10 10 5-10 5-5 10-5-10-10-5 10-5zM295 82l4 8 8 4-8 4-4 8-4-8-8-4 8-4z" fill="#E6B34F"/>'
    },
    'curious-child': {
      label: 'A curious child discovering something new',
      body: '<circle cx="180" cy="116" r="92" fill="#F8E9D9"/><path d="M69 197c20-34 51-48 91-48s72 14 91 48z" fill="#DDEFE5"/><path d="M125 174c-13-14-19-32-17-54 2-29 20-49 49-50 28-1 47 19 49 48 2 23-5 43-18 57z" fill="#A9674D"/><path d="M114 112c-4-35 15-57 45-57 29 0 49 23 45 58-11-12-26-18-45-17-17 1-33 6-45 16z" fill="#2A211F"/><circle cx="151" cy="119" r="3" fill="#34221D"/><circle cx="177" cy="119" r="3" fill="#34221D"/><path d="M154 136q10 9 21 0" fill="none" stroke="#70402F" stroke-width="3" stroke-linecap="round"/><path d="M126 165c-18 10-27 23-31 40h126c-3-17-13-30-31-40z" fill="#4D7BBF"/><path d="M240 60l7 15 16 7-16 7-7 16-7-16-16-7 16-7z" fill="#E6B34F"/><circle cx="88" cy="86" r="8" fill="#E8A17D"/><circle cx="276" cy="142" r="6" fill="#73B987"/>'
    },
    'practice-pencil': {
      label: 'A pencil and worksheet ready for practice',
      body: '<ellipse cx="180" cy="192" rx="132" ry="18" fill="#E2EAFE"/><rect x="96" y="44" width="166" height="158" rx="17" fill="#FFFDF8" stroke="#D8B99A" stroke-width="4"/><path d="M125 83h102M125 111h79M125 139h102M125 167h67" stroke="#C9D7E8" stroke-width="5" stroke-linecap="round"/><path d="M109 81l6 6 11-13m-17 41 6 6 11-13m-17 41 6 6 11-13" fill="none" stroke="#65A77A" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><g transform="rotate(34 267 129)"><rect x="253" y="74" width="24" height="116" rx="8" fill="#E8A17D"/><path d="M253 84h24" stroke="#C97E5A" stroke-width="4"/><path d="M253 74l12-22 12 22z" fill="#F1D2A6"/><path d="M261 61l4-9 4 9z" fill="#38302A"/></g><circle cx="82" cy="59" r="7" fill="#E6B34F"/><path d="M290 49l5 11 11 5-11 5-5 11-5-11-11-5 11-5z" fill="#73B987"/>'
    },
    'celebration': {
      label: 'A happy child celebrating a learning achievement',
      body: '<circle cx="180" cy="115" r="90" fill="#F9E8D5"/><path d="M112 191c8-34 31-52 68-52s60 18 68 52z" fill="#4D7BBF"/><circle cx="180" cy="103" r="34" fill="#A9674D"/><path d="M147 98c-2-31 14-50 37-50 24 0 41 19 38 50-10-10-23-15-39-15-14 0-26 5-36 15z" fill="#29211F"/><path d="M151 116q9 11 18 0m22 0q9 11 18 0" fill="none" stroke="#34221D" stroke-width="3" stroke-linecap="round"/><path d="M168 132q12 12 24 0" fill="none" stroke="#70402F" stroke-width="3" stroke-linecap="round"/><path d="M121 161l-29-26m147 26 29-26" stroke="#A9674D" stroke-width="13" stroke-linecap="round"/><path d="M69 73l6 13 13 6-13 6-6 13-6-13-13-6 13-6zM284 60l5 11 11 5-11 5-5 11-5-11-11-5 11-5z" fill="#E6B34F"/><circle cx="93" cy="148" r="6" fill="#73B987"/><circle cx="275" cy="147" r="7" fill="#E8A17D"/><path d="M180 17l7 16 17 7-17 7-7 17-7-17-17-7 17-7z" fill="#E6B34F"/>'
    },
    'empty-books': {
      label: 'A welcoming stack of books and a small plant',
      body: '<ellipse cx="180" cy="191" rx="127" ry="17" fill="#E2EAFE"/><rect x="76" y="142" width="205" height="45" rx="10" fill="#4D7BBF"/><rect x="92" y="105" width="190" height="39" rx="9" fill="#E8A17D"/><rect x="109" y="70" width="165" height="37" rx="9" fill="#73B987"/><path d="M112 80h143M95 116h164M91 154h174" stroke="#FFFDF8" stroke-width="4" stroke-linecap="round" opacity=".75"/><path d="M297 146v-50m0 24c-21-1-30-13-28-29 17-1 28 10 28 29zm0-8c2-20 14-30 31-28 1 17-11 28-31 28z" fill="#73B987" stroke="#4C9A72" stroke-width="3"/><circle cx="72" cy="62" r="7" fill="#E6B34F"/><path d="M296 45l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="#E8A17D"/>'
    }
  };
  function render(name, className) {
    var scene = scenes[name] || scenes['book-sprout'];
    var cls = String(className || '').replace(/[^a-z0-9 _-]/gi, '');
    return '<svg class="guided-family-illustration ' + cls + '" viewBox="0 0 360 240" role="img" aria-label="' + scene.label + '" xmlns="http://www.w3.org/2000/svg"><g>' + scene.body + '</g></svg>';
  }
  var api = { render: render };
  if (root) {
    root.GuidEdFamilyArt = api;
    var splash = root.document && root.document.getElementById('splash');
    if (splash) {
      var art = root.document.createElement('div');
      art.className = 'splash-art';
      art.innerHTML = render('book-sprout', 'splash-illustration');
      splash.insertBefore(art, splash.firstChild);
    }
  }
})(typeof window !== 'undefined' ? window : null);
