import re

with open('index.html', 'r') as f:
    html = f.read()

# 1. Insert Discounts UI section in the HTML just after demandTariffSection
discounts_html = """
                             <div id="discountsSection" class="mt-4 pt-4 border-t">
                                <div class="flex items-center mb-2 justify-between">
                                    <h3 class="block text-base font-medium text-gray-800">Discounts</h3>
                                    <button type="button" onclick="addDiscount()" class="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Add Discount</button>
                                </div>
                                <div id="discountsContainer" class="space-y-3">
                                    <!-- Discounts will be injected here -->
                                </div>
                                <p class="text-xs text-gray-500 mt-2">Discounts apply to the final calculated costs. "Usage Only" applies to usage charges (excluding feed-in). "Usage & Daily Charges" applies to usage, daily connection, and demand charges.</p>
                            </div>
"""

html = html.replace('</div>\n                        </div>\n                    </div>\n                </div>\n             \n\n                <div class="grid grid-cols-1',
                    f'{discounts_html}                        </div>\n                    </div>\n                </div>\n             \n\n                <div class="grid grid-cols-1')

# 2. Add addDiscount helper function
js_add_discount = """
        function addDiscount(discountData = null) {
            const container = document.getElementById('discountsContainer');
            if (!container) return;
            const discountDiv = document.createElement('div');
            discountDiv.className = 'discount-item relative bg-white border border-gray-300 p-3 rounded shadow-sm text-sm';

            const descVal = discountData && discountData.description ? discountData.description : '';
            const percentVal = discountData && discountData.percent !== undefined ? discountData.percent : '';
            const coverVal = discountData && discountData.cover ? discountData.cover : 'usage';

            discountDiv.innerHTML = `
                <button type="button" class="absolute top-1 right-1 text-gray-400 hover:text-red-500 font-bold px-1" title="Remove" onclick="this.closest('.discount-item').remove(); if(typeof saveAllSettings === 'function') saveAllSettings();">×</button>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pr-6">
                    <div class="sm:col-span-1">
                        <label class="block text-xs font-medium text-gray-600 mb-1">Description</label>
                        <input type="text" class="discount-desc w-full text-sm px-2 py-1 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500" placeholder="e.g. Pay on time" value="${escapeHTML(descVal)}">
                    </div>
                    <div class="sm:col-span-1">
                        <label class="block text-xs font-medium text-gray-600 mb-1">Percentage (%)</label>
                        <input type="number" step="0.01" class="discount-percent w-full text-sm px-2 py-1 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500" placeholder="e.g. 2" value="${percentVal}">
                    </div>
                    <div class="sm:col-span-1">
                        <label class="block text-xs font-medium text-gray-600 mb-1">Applies to</label>
                        <select class="discount-cover w-full text-sm px-2 py-1 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500">
                            <option value="usage" ${coverVal === 'usage' ? 'selected' : ''}>Usage Only</option>
                            <option value="all" ${coverVal === 'all' ? 'selected' : ''}>Usage & Daily Charges</option>
                        </select>
                    </div>
                </div>
            `;

            discountDiv.querySelectorAll('input, select').forEach(input => {
                input.addEventListener('change', () => {
                    if (typeof saveAllSettings === 'function') saveAllSettings();
                });
            });

            container.appendChild(discountDiv);
        }
"""
html = html.replace('function addTouWindow(period, windowData = null) {', f'{js_add_discount}\n        function addTouWindow(period, windowData = null) {{')


# 3. Update clearPlanInputs
clear_inputs_replacement = """
            // Clear discounts
            const discountsContainer = document.getElementById('discountsContainer');
            if (discountsContainer) {
                discountsContainer.innerHTML = '';
            }

            saveAllSettings();
"""
html = html.replace('saveAllSettings();\n        }\n\n        function applyPlanTemplate() {', f'{clear_inputs_replacement}\n        }}\n\n        function applyPlanTemplate() {{')


# 4. Update applyPlanTemplate
apply_template_replacement = """
            const discountsContainer = document.getElementById('discountsContainer');
            if (discountsContainer) {
                discountsContainer.innerHTML = '';
                if (template.discounts && template.discounts.length > 0) {
                    template.discounts.forEach(discount => addDiscount(discount));
                }
            }

            saveAllSettings();
"""
html = html.replace('saveAllSettings();\n        }\n\n        function updateOtherSupplierHeading() {', f'{apply_template_replacement}\n        }}\n\n        function updateOtherSupplierHeading() {{')


# 5. Update saveAllSettings
save_settings_replacement = """
            const discounts = [];
            document.querySelectorAll('#discountsContainer .discount-item').forEach(item => {
                const desc = item.querySelector('.discount-desc').value.trim();
                const percent = parseFloat(item.querySelector('.discount-percent').value);
                const cover = item.querySelector('.discount-cover').value;
                if (desc && !isNaN(percent)) {
                    discounts.push({ description: desc, percent: percent, cover: cover });
                }
            });
            localStorage.setItem('discounts', JSON.stringify(discounts));
        }
"""
html = html.replace('localStorage.setItem(\'demandSettings\', JSON.stringify(demandSettings));\n        }', f'localStorage.setItem(\'demandSettings\', JSON.stringify(demandSettings));\n{save_settings_replacement}')


# 6. Update loadAllSettings
load_settings_replacement = """
                const savedDiscounts = localStorage.getItem('discounts');
                if (savedDiscounts) {
                    const discounts = JSON.parse(savedDiscounts);
                    const discountsContainer = document.getElementById('discountsContainer');
                    if (discountsContainer) {
                        discountsContainer.innerHTML = '';
                        discounts.forEach(discount => addDiscount(discount));
                    }
                }
            }
"""
html = html.replace('cb.checked = (settings.days || []).includes(parseInt(cb.value));\n                    });\n                }\n            }', f'cb.checked = (settings.days || []).includes(parseInt(cb.value));\n                    }};\n                }}\n{load_settings_replacement}')


# 7. Update createPlanObjectFromForm
create_plan_replacement = """
            const discounts = [];
            document.querySelectorAll('#discountsContainer .discount-item').forEach(item => {
                const desc = item.querySelector('.discount-desc').value.trim();
                const percent = parseFloat(item.querySelector('.discount-percent').value);
                const cover = item.querySelector('.discount-cover').value;
                if (desc && !isNaN(percent)) {
                    discounts.push({ description: desc, percent: percent, cover: cover });
                }
            });

            if (rateType === 'flat') {
                return {
                    rateType: 'flat',
                    daily: parseFloat(document.getElementById('dailyConnectionRate').value),
                    flat: parseFloat(document.getElementById('otherSupplierRate').value),
                    feedIn: parseFloat(document.getElementById('otherSupplierFeedInRateFlat').value),
                    demand: demandConfig,
                    discounts: discounts
                };
"""
html = html.replace("""
            if (rateType === 'flat') {
                return {
                    rateType: 'flat',
                    daily: parseFloat(document.getElementById('dailyConnectionRate').value),
                    flat: parseFloat(document.getElementById('otherSupplierRate').value),
                    feedIn: parseFloat(document.getElementById('otherSupplierFeedInRateFlat').value),
                    demand: demandConfig
                };""", create_plan_replacement)

create_plan_tou_replacement = """
                    },
                    demand: demandConfig,
                    discounts: discounts
                };
"""
html = html.replace("""
                    },
                    demand: demandConfig
                };
""", create_plan_tou_replacement)

with open('index.html', 'w') as f:
    f.write(html)

print("UI modifications script executed.")
