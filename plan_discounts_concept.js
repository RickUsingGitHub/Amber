const plan = {
    rateType: 'flat',
    daily: 100,
    flat: 30,
    feedIn: 5,
    demand: { e: false },
    discounts: [
        {
            description: "Pay on time discount",
            percent: 2,
            cover: "usage" // or "all"
        },
        {
            description: "Direct debit discount",
            percent: 1,
            cover: "all"
        }
    ]
};
console.log(plan);
