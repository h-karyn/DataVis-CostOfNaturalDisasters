// Initialize helper function to convert date strings to date objects
const parseTime = d3.timeParse("%Y-%m-%d");

let timeline, data;
// Initialize dispatcher that is used to orchestrate events
const dispatcher = d3.dispatch('filterCategories');

// create a global array to store the selected categories
let selectedCategories = [];
let global_max, global_min;
let year_in_des_order = [];

//Load data from CSV file asynchronously and render chart
d3.csv('data/disaster_costs.csv').then(_data => {
    data = _data;
    data.forEach(d => {
        d.cost = +d.cost;
        d.year = +d.year;
        d.date = parseTime(d.mid);

        d.month = d.date.getMonth();
    });

    global_min = d3.min(data, d => d.cost);
    global_max = d3.max(data, d => d.cost);

    year_in_des_order = data.map(d => d.year).sort((a, b) => b - a);

    timeline = new Timeline({
        parentElement: '#vis',
    }, data, dispatcher);

});

/**
 * Dispatcher waits for 'filterCategory' event
 * We filter data based on the selected categories and update the scatterplot
 */
dispatcher.on('filterCategories', selectedCategories => {
    if (selectedCategories.length === 0) {
        timeline.data = data;
    } else {
        timeline.data = data.filter(d => selectedCategories.includes(d.category));
    }
    timeline.updateVis();
});