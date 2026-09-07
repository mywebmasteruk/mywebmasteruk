/**
 * Fills in what the customer already told Stripe, so the welcome page does not
 * ask for it a second time. External file rather than inline because the site's
 * content security policy only allows scripts from its own origin.
 */
(function () {
  var id = new URLSearchParams(location.search).get("session_id");
  if (!id) return;

  fetch("/api/session-info?session_id=" + encodeURIComponent(id))
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d) return;

      if (d.website) {
        var field = document.getElementById("site");
        if (field) {
          field.value = /^https?:\/\//i.test(d.website) ? d.website : "https://" + d.website;
          var note = document.getElementById("site-note");
          if (note) {
            note.textContent = "Taken from your checkout. Change it if that is not the right address.";
            note.hidden = false;
          }
        }
      }

      if (d.firstName) {
        var greet = document.getElementById("greeting");
        if (greet) greet.textContent = d.firstName + ", your site is on Autopilot.";
      }

      if (d.plan) {
        var plan = document.getElementById("plan-name");
        if (plan) { plan.textContent = d.plan; plan.hidden = false; }
      }
    })
    .catch(function () { /* the page works perfectly well without this */ });
})();
