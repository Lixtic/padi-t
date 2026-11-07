try { var t = localStorage.getItem('schoolpadi.theme'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) { /* keep system theme */ }
