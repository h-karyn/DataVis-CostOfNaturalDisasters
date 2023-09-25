class Timeline {

    /**
     * Class constructor with initial configuration
     * @param {Object}
     * @param {Array}
     */
    constructor(_config, _data, _dispatcher) {
        this.config = {
            parentElement: _config.parentElement,
            disasterCategories: _config.disasterCategories,
            containerWidth: 800, // Fixed, don't touch
            containerHeight: 900, // Feel free to adjust
            tooltipPadding: 15,
            margin: {top: 120, right: 20, bottom: 20, left: 45},
            legendWidth: 170,
            legendHeight: 8,
            legendRadius: 5
        }
        this.data = _data;
        this.dispatcher = _dispatcher;

        this.minPixel = 4;
        this.maxPixel = 140;
        this.selectedCategories = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; // Need to confirm this
        this.initVis();
    }

    /**
     * We initialize the arc generator, scales, axes, and append static elements
     */
    initVis() {
        let vis = this;

        // Calculate inner chart size. Margin specifies the space around the actual chart.
        vis.width = vis.config.containerWidth - vis.config.margin.left - vis.config.margin.right;
        vis.height = vis.config.containerHeight - vis.config.margin.top - vis.config.margin.bottom;

        // Initialize arc generator that we use to create the SVG path for the half circles.
        vis.arcGenerator = d3.arc()
            .outerRadius(d => vis.radiusScale(d))
            .innerRadius(0)
            .startAngle(-Math.PI / 2)
            .endAngle(Math.PI / 2);

        // Define size of SVG drawing area
        vis.svg = d3.select(vis.config.parentElement).append('svg')
            .attr('width', vis.config.containerWidth)
            .attr('height', vis.config.containerHeight);

        // Append group element that will contain our actual chart and position it according to the given margin config
        vis.chartArea = vis.svg
            .append('g')
            .attr('transform', `translate(${vis.config.margin.left},${vis.config.margin.top})`);

        // Empty group for all the stacked bar charts
        vis.chart = vis.chartArea.append('g');

        // Empty group for the legend
        vis.legend = vis.svg.append('g')
            .attr('transform', `translate(0, 0)`);

        // Initialize scales and axes
        vis.xScale = d3.scaleTime()
            // the domain of data.date
            .domain([new Date(2000, 0, 1), new Date(2000, 11, 31)]) // This is a lap year so
            // that Feb 29th is included
            .range([0, vis.width]);

        vis.yScale = d3.scaleBand()
            // init domain with all years between 1980 and 2017 in descending order
            .domain(Array.from({length: 38}, (_, i) => 2017 - i))
            .range([0, vis.height])

        vis.xAxis = d3.axisTop(vis.xScale)
            .ticks(13)
            .tickFormat((d, i) => this.selectedCategories[i]);

        vis.yAxis = d3.axisLeft(vis.yScale)
            .tickSize(-vis.width);

        vis.xAxisGroup = vis.chartArea.append('g')
            .attr('class', 'axis x-axis')
            .attr('transform', `translate(0, 0)`);

        vis.yAxisGroup = vis.chartArea.append('g')
            .attr('class', 'axis y-axis')
            .attr('transform', `translate(0, 0)`);

        // Initialize clipping mask that covers the whole chart
        vis.chartArea.append('defs')
            .append('clipPath')
            .attr('id', 'chart-mask')
            .append('rect')
            .attr('width', vis.width)
            .attr('y', -vis.config.margin.top)
            .attr('height', vis.config.containerHeight);

        // Apply clipping mask to 'vis.chart' to clip semicircles at the very beginning and end of a year
        vis.chart = vis.chartArea.append('g')
            .attr('clip-path', 'url(#chart-mask)');

        // Add text in the top right corner
        vis.svg.append("text")
            .attr("x", vis.width -90)
            .attr("y", 15)
            .style("font-size", "11px")
            .style("fill", "grey")
            .attr("text-anchor", "end")
            .append("tspan")
            .text("Circles are sized proportional to")
            .attr("x", vis.width + 50)
            .attr("dy", "1.2em")
            .append("tspan")
            .text("their cost in 2017 dollars.")
            .attr("x", vis.width + 50)
            .attr("dy", "1.2em");

        vis.updateVis();
    }

    /**
     * Prepare the data and scales before we render it.
     */
    updateVis() {
        let vis = this;

        // get the maximum cost of the entire dataset
        vis.maxCost = global_max;
        vis.minCost = global_min;

        // Group data per year (we get a nested array)
        // You can use d3.groups(data, d => d.year) to group all rows in the dataset and create a 2-dimensional array.
        vis.groupedData = d3.groups(vis.data, d => d.year);

        // sort groupedData by year
        vis.groupedData.sort((a, b) => b[0] - a[0]);

        // create a new field is_max_of_the_year in each disaster object which is true if the cost of the disaster is the maximum of the year
        vis.groupedData.forEach(d => {
            let maxCost = d3.max(d[1], d => d.cost);
            d[1].forEach(d => {
                if (d.cost === maxCost) {
                    d.is_max_of_the_year = "true";
                } else {
                    d.is_max_of_the_year = "false";
                }
            });
        });

        // Specify accessor functions
        vis.xValue = d => d.date.setFullYear(2000); // This is a lap year so that Feb 29th is included


        vis.yScale.domain(year_in_des_order);
        vis.xScale.domain([new Date(2000, 0, 1), new Date(2000, 11, 31)]);
        // Note for the xScale domain: despite applying filters, we want to use the lap year as the
        // reference domain for the xScale because if contains feb 29th which is not included in the other years.
        // Additionally, the xScale domain will not change even if we apply filters


        vis.renderVis();
        vis.renderLegend();
    }

    /**
     * Bind data to visual elements (enter-update-exit) and update axes
     */
    renderVis() {
        let vis = this;

        // 1st level: Create a group for each year and set the position using SVG's translate() transformation.
        // Bind data to selection and use d.year as a key
        const yearGroup = vis.chart
            .selectAll(".year-group")  //
            .data(vis.groupedData, (d) => d.year); // key function, update

        // Enter
        const yearEnter = yearGroup.enter().append("g").attr("class", "year-group");

        // Enter + update
        yearEnter
            .merge(yearGroup)
            .attr("transform", (d) => `translate(0,${vis.yScale(d[0]) + vis.yScale.bandwidth() / 2})`);

        // Exit
        yearGroup.exit().remove();

        // 2nd level: Within each year group, create a group for each disaster (each individual distaster, NOT disaster
        // category) and position it based on the day of the year.

        // Bind data to selection and use d.date as a key
        const disasterGroup = yearGroup
            .merge(yearEnter)
            .selectAll(".disaster-group")
            .data((d) => d[1], (d) => d.name);

        // Enter
        const disasterEnter = disasterGroup.enter().append("g").attr("class", "disaster-group")

        // Enter + update
        disasterEnter
            .merge(disasterGroup)
            .attr("transform", (d) => `translate(${vis.xScale(vis.xValue(d))},0)`)
            .on("mouseover", (event, d) => {
                d3
                    .select("#tooltip")
                    .style("display", "block")
                    .style("left", event.pageX + vis.config.tooltipPadding + "px")
                    .style("top", event.pageY + vis.config.tooltipPadding + "px").html(`
              <div >${d.name}</div>
              <div><strong> $${d.cost} billion<strong></div>
            `);
            })
            .on("mouseleave", () => {
                d3.select("#tooltip").style("display", "none");
            });

        // Exit
        disasterGroup.exit().remove();

        // 3rd level: Within each disaster, create a path element for the semicircle, and a text label for the largest disaster per year (see Task 5).
        // 3.1 Create a path element for the semicircle
        const disasterPath = disasterGroup
            .merge(disasterEnter)
            .selectAll(".mark")
            .data((d) => {
                return [d];
            });

        const disasterPathEnter = disasterPath.enter().append("path")
            .attr("class", d => `mark ${d.category}`)

        disasterPathEnter.merge(disasterPath)
            .attr('d', d => vis.arcGenerator(d.cost))

        // Exit
        disasterPath.exit().remove();

        // 3.2 Create a text label for each disaster
        const disasterText = disasterGroup
            .merge(disasterEnter)
            .selectAll(".text-annotation")
            .data((d) => {
                return [d];
            });

        const disasterTextEnter = disasterText.enter().append("text")
            .attr("class", "text-annotation")
            .attr("text-anchor", "middle")
            .attr("dy", vis.yScale.bandwidth() / 2);    // put the text label below the semicircle

        disasterTextEnter.merge(disasterText)
            // if the disaster is the largest of the year, display the name of the disaster, otherwise display ""
            .text(d => {
                if (d.is_max_of_the_year === "true") {
                    return d.name;
                } else {
                    return "";
                }
            });

        vis.xAxisGroup.call(vis.xAxis).call((g) => g.select(".domain").remove());
        vis.yAxisGroup.call(vis.yAxis).call((g) => g.select(".domain").remove());
    }

    renderLegend() {
        let vis = this;

        const titles = ['Winter storm, freezing',
            'Drought and wildfire',
            'Flooding',
            'Tropical cyclones',
            'Severe storms'];

        const categories = ['winter-storm-freeze',
            'drought-wildfire',
            'flooding',
            'tropical-cyclone',
            'severe-storm'];

        let color = d3.scaleOrdinal()
            .domain(titles)
            .range(["#ccc", "#ffffd9", "#41b6c4", "#081d58", "#c7e9b4"]);

        vis.cate = vis.svg.selectAll("g.cate")
            .data(titles)
            .enter()
            .append("g")
            .attr("class", "cate")
            .on('click', function (event, d) {

                const selected = d3.select(this).data(); // get the selected object
                const index = selected.map(k => titles.indexOf(k)); // map titles.indexOf to selected

                // if index exists in selectedCategories, remove it; otherwise add it
                if (selectedCategories.includes(categories[index])) {
                    selectedCategories.splice(selectedCategories.indexOf(categories[index]), 1);
                } else {
                    selectedCategories.push(categories[index]);
                }

                // Trigger filter event and pass array with the selected category names
                vis.dispatcher.call('filterCategories', event, selectedCategories);

                // Update text color and font weight based on selectedCategories
                vis.svg.selectAll("g.cate text")
                    .data(titles)
                    .style("fill", function(d, i) {
                        const index = categories.indexOf(selectedCategories.find(cat => cat === categories[i]));
                        return index !== -1 ? "black" : "grey";
                    })
                    .style("font-weight", function(d, i) {
                        const index = categories.indexOf(selectedCategories.find(cat => cat === categories[i]));
                        return index !== -1 ? "bold" : "normal";
                    })
            });

        vis.cate.append("circle")
            .attr("r", 7)
            .style('stroke', 'gray')
            .style('opacity', 0.6)
            .style("fill", function (d) {
                return color(d)
            })
            .attr("transform", (d, i) => vis.positionCircles(d, i))

        vis.cate.append("text")
            .text(function (d) {
                return d
            })
            .attr("text-anchor", "left")
            .style("alignment-baseline", "middle")
            .attr("transform", (d, i) => vis.positionText(d, i));
    }

    radiusScale(d) {
        const vis = this;

        const scale = d3.scaleSqrt()
            .domain([vis.minCost, vis.maxCost])
            .range([this.minPixel, this.maxPixel]);

        return scale(d);
    }

    positionCircles(d, i) {
        let xOff = (i % 2) * 140 + 20
        let yOff = Math.floor(i / 2) * 20 + 20
        return "translate(" + xOff + "," + yOff + ")"
    }

    positionText(d, i) {
        let posCircles = this.positionCircles(d, i);

        const regex = /translate\((\d+),(\d+)\)/;
        const numbers = posCircles.match(regex);

        const xOff = parseInt(numbers[1]);
        const yOff = parseInt(numbers[2]);

        return "translate(" + (xOff + 15) + "," + yOff + ")";
    }
}