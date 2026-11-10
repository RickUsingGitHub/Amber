(function (root) {
    const Amber = root.Amber = root.Amber || {};
    const app = Amber.app;
    const state = app.state;
    const $ = app.$;

    /*
     * The settings menu (the cog in the header): clearing saved meter readings and everything
     * worked out from them, and deleting the plans the user typed in. What an action did is shown
     * in a short note under the page title, so it is seen on every tab.
     */

    // A short note under the page title for the settings menu's actions, so it shows on every tab.
    let settingsMessageTimer = null;
    function showSettingsMessage(text, colourClass, clearAfterMs) {
        const msg = $('cacheMessage');
        msg.textContent = text;
        msg.className = `text-sm mt-2 font-medium ${colourClass}`;
        clearTimeout(settingsMessageTimer);
        if (clearAfterMs) settingsMessageTimer = setTimeout(() => { msg.textContent = ''; }, clearAfterMs);
    }

    function closeSettingsMenu() {
        $('settingsMenu').classList.add('hidden');
        $('settingsBtn').setAttribute('aria-expanded', 'false');
    }

    /** "Clear saved meter readings": empty the cache, and everything worked out from it. */
    async function clearSavedReadings() {
        closeSettingsMenu();
        if (state.fetching) {
            showSettingsMessage('Wait for the Compare in progress to finish, then try again.', 'text-orange-600', 8000);
            return;
        }
        const households = app.loadLocalSites().length;
        const question = 'Clear all saved meter readings?\n\n'
            + 'Readings from Amber download again next time (about the last 3 months). Older readings you imported from a file will need importing again.'
            + (households ? `\n\n${households === 1 ? 'The household' : `The ${households} households`} imported from NEM12 files will be removed.` : '');
        if (!window.confirm(question)) return;
        showSettingsMessage('Clearing saved meter readings…', 'text-yellow-600');
        try {
            await Amber.deleteDatabase();
        } catch (err) {
            // Only a tab still running an older version of the app holds the database open.
            if (err && err.message === 'blocked') showSettingsMessage('Couldn\'t clear the readings yet: the app is open in another tab or window. Close it there, then try again.', 'text-orange-600', 12000);
            else showSettingsMessage('Couldn\'t clear the saved meter readings.', 'text-red-600', 12000);
            return;
        }
        // An imported household is only its readings, so it goes too.
        app.saveLocalSites([]);
        state.cachedChannelData = null;
        state.cachedAllChannelData = null;
        state.lastResultDataPayload = null;
        state.monthly = null;
        state.dailySummaries = {};
        state.lastFetchedStartDate = null;
        state.lastFetchedEndDate = null;
        state.lastFetchTimestamp = null;
        state.batteryShift = null;
        state.batteryDetect = null;
        app.hideResults();
        app.hideMessage();
        $('calendar-container').innerHTML = '';
        $('monthlySection').classList.add('hidden');
        app.populateSites(state.sites);
        app.syncConnectedUi();
        app.updatePlanSavings();
        app.renderBillCheck();
        app.updateCacheSummary();
        // Solar+? has no dates bar, and shows what it can still work from.
        if (state.activeTab === 'plan') {
            $('configSection').classList.add('hidden');
            $('resultTools').classList.add('hidden');
            if (Amber.plannerUi) Amber.plannerUi.show();
        }
        showSettingsMessage('Saved meter readings cleared.', 'text-green-600', 8000);
    }

    function buildSettingsMenu() {
        $('settingsMenu').innerHTML = `
            <button type="button" id="clearCacheBtn" class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">Clear saved meter readings<span class="block text-xs text-gray-500">They download again from Amber next time (about the last 3 months only). Imported files need importing again</span></button>
            <div class="border-t border-gray-100"></div>
            <button type="button" id="clearCustomPlansBtn" class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">Delete plans I typed in<span class="block text-xs text-gray-500">The built-in plans stay</span></button>
        `;
        $('clearCustomPlansBtn').addEventListener('click', () => {
            closeSettingsMenu();
            if (!window.confirm('Delete ALL saved custom plans? This cannot be undone.')) return;
            const oldCustomPlans = app.storedCustomPlans();
            localStorage.removeItem('customSupplierPlans');
            Object.keys(oldCustomPlans).forEach((stateCode) => {
                if (!state.templates[stateCode]) return;
                Object.keys(oldCustomPlans[stateCode]).forEach((planName) => {
                    if (!app.isBuiltInPlan(stateCode, planName)) delete state.templates[stateCode][planName];
                });
            });
            const previouslySelected = $('planSelector').value;
            app.updatePlanSelector($('stateSelector').value);
            if (previouslySelected && !(state.templates[$('stateSelector').value] || {})[previouslySelected]) {
                $('planSelector').value = '';
                app.clearPlanInputs();
            }
            showSettingsMessage('The plans you typed in were deleted.', 'text-green-600', 8000);
        });
        $('clearCacheBtn').addEventListener('click', clearSavedReadings);
    }

    /** Build the settings menu and wire up its button. */
    function setupSettingsMenu() {
        buildSettingsMenu();
        $('settingsBtn').addEventListener('click', (event) => {
            event.stopPropagation();
            const open = $('settingsMenu').classList.toggle('hidden');
            $('settingsBtn').setAttribute('aria-expanded', open ? 'false' : 'true');
        });
    }

    // What the other app-*.js files use from this one.
    Object.assign(app, {
        closeSettingsMenu, setupSettingsMenu
    });

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
