/* global TrelloPowerUp */

console.log("🚀 TEST Power-Up loaded successfully!");
console.log("📍 Current URL:", window.location.href);
console.log("🔍 TrelloPowerUp available:", typeof TrelloPowerUp);

TrelloPowerUp.initialize({
  'card-badges': function(t, options) {
    console.log("✅ card-badges callback triggered!");
    return [{
      text: '✅ WORKING',
      color: 'green',
    }];
  },
  'card-back-section': function(t, options) {
    console.log("✅ card-back-section callback triggered!");
    return {
      title: 'Test Power-Up',
      content: {
        type: 'iframe',
        url: t.signUrl('https://turbotenant.github.io/trello-powerups/time-in-list/index.html'),
        height: 200
      }
    };
  }
});

console.log("✨ TEST Power-Up initialization complete!");

