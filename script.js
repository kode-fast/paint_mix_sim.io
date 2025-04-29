
// -------------PAGE SETUP----------------------------
const colorPicker = document.getElementById("colorPicker");

const canvas = document.getElementById("canvas");

// in future could use context webgl for preformance?
const ctx = canvas.getContext("2d", {willReadFrequently : true});

// set canvas size 
canvas.width = 800//window.innerWidth * 0.95;
canvas.height = 800 //window.innerHeight * 0.95;

// canvas color 
ctx.fillStyle = "#f2f2f2";
ctx.fillRect(0, 0, canvas.width, canvas.height);

//-------- GLOBAL PAINT / PIGMENT ARRAYS---------------------
const arrayRange = (start, stop, step) =>
    Array.from(
    { length: (stop - start) / step + 1 },
    (value, index) => start + index * step
    );

const wavelengths = arrayRange(380,750,37);
// 380 417 454 491 528 565 602 639 676 713 750


// PIGMENT CREDITS : IMPaSTo: A Realistic, Interactive Model for Paint William Baxter, Jeremy Wendt, and Ming C. Lin Department of Computer Science University of North Carolina at Chapel Hill
// - arrays for better preformace (with small amount of values)
// K is the absorption coefficient. High K values absorb more light.
// S is the scattering coefficient. Higher S values scatter more light back.

// K,S pairs
const initalPigments = [
    [[0.001, 10.0], [0.001, 10.0], [0.001, 10.0], [0.001, 10.0], [0.001, 10.0], [0.001, 10.0], [0.001, 10.0], [0.001, 10.0], [0.001, 10.0], [0.001, 10.0], [0.001, 10.0]], // white
    [[0.02, 0.005], [0.015, 0.002], [0.03, 0.002], [0.05, 0.004], [0.12, 0.01], [0.45, 0.03], [0.65, 0.08], [0.01, 0.06], [0.015, 0.08], [0.02, 0.12], [0.25, 0.18]], // red
    [[0.001, 0.07], [0.001, 0.05], [0.001, 0.03], [0.001, 0.02], [0.015, 0.04], [0.45, 0.07], [0.68, 0.09], [0.9, 0.2], [0.2, 0.1], [0.01, 0.17], [0.005, 0.22]], // yellow
    [[3.0, 0.1], [1.0, 0.2], [0.85, 0.5], [0.6, 0.55], [0.3, 0.5], [0.08, 0.55], [0.09, 0.57], [0.1, 0.6], [0.02, 0.62], [0.01, 0.63], [0.007, 0.67]] // blue
];

// CIE XYZ referance function at wavelengths - credit CIE
const cieXYZ = [
    [0.001368000000,0.0000390000000,0.006450001000],
    [0.097176720000,0.0027640000000,0.465464200000],
    [0.322886800000,0.0458426700000,1.752466300000],
    [0.027917200000,0.2171199000000,0.439924600000],
    [0.142367900000,0.8363068000000,0.047752760000],
    [0.678400000000,0.9786000000000,0.002749999000],
    [1.058443600000,0.6053144000000,0.000723680000],
    [0.466193900000,0.1829744000000,0.000021813330],
    [0.059806850000,0.0218007700000,0.000000000000],
    [0.004717512000,0.0017035800000,0.000000000000],
    [0.000332301100,0.0001200000000,0.000000000000]
];

// D65 lighting values at  wavelenths - credit CIE
const D65 = [
    49.9755,
    92.8481,
    117.33,
    108.865,
    107.109,
    98.5337,
    89.9248,
    83.6581,
    79.8816,
    70.5255,
    63.5927
];


// YD65 = integrate cieY*D65 over wavelenghts 
let yD65 = 0.0;
for (var i =0; i < D65.length; i++){
    yD65 = yD65 + (cieXYZ[i][1]*D65[i]);
}

// n1 = ior of air 
// n2 = ior of point medium 
// n3 = ior of substrate 
const n1 = 1.0;
const n2 = 1.6;
const n3 = 1.5;
const k1 = ((n1 - n2) / (n1 + n2))**2;
const k2 = ((n2 - n3) / (n2 + n3))**2;

// TODO sort out direction of the vectors 
// LIGHT VECTOR WAS BACKWORDS  ? (prev was -1 z)
let lightVector = [-1.5, -1.5, 5.0]


const normalMap = [];
let pigment = [];

for (let i = 0; i < canvas.width; i++) {
    normalMap[i] = [];
    pigment[i] = [];
    for (let j = 0; j < canvas.height; j++) {
        // normal pointing up (z axis)
        normalMap[i][j] = [0.0,0.0,1.0];
        // this will to be a list of K and S values at each wavelength gamma
        pigment[i][j] = false;
    }
}


// TEST CONVERT TO RGB 
function initalRGB(p){
    let R_mix_prime = mixPigments(p, p, 1.0,0.0);
    let XYZ = RmixTOXYZ(R_mix_prime);
    let RGB = XYZToRGB(XYZ[0], XYZ[1], XYZ[2]);
    //console.log("mix test:", RGB);
}

let canvasColor = initalRGB(initalPigments[0]);

// ------- BRUSH STUFF ---------------------
// TODO move to brush class - set brush settings 
let painting = false;
let brushColor = "#00ff00";
let brushRGB = hexToRGB(brushColor)
let brushPigment = initalPigments[1];
let baseBrushSize = 25;
let brushSize = 25;
let brushOpacity = 0.7;
// const brush = new Brush(brushSize, brushColor);

//------- GLOBAL MOUSE POSITIONS ------------------
let prevX = 0;
let prevY = 0;
let X = 0;
let Y = 0;

// ----------- PIGMENT ENGINE ------------------------
// Implementing Kubelka - Munk Theory

function colorMix(bushPigment, canvasPigment, c, x,y){
    let R_mix_prime,new_pigment;
    if (!canvasPigment){
        [R_mix_prime,new_pigment] = mixPigments(bushPigment, bushPigment, c,1.0-c);
    }
    else{
        [R_mix_prime,new_pigment] = mixPigments(bushPigment, canvasPigment, c,1.0-c);
    }
    // NOTE THIS IS WHERE WE update canvas pigment too
    pigment[x][y] = new_pigment;
    let XYZ = RmixTOXYZ(R_mix_prime);
    let RGB = XYZToRGB(XYZ[0], XYZ[1], XYZ[2]);
    return RGB;
}

function mixPigments(pigment1, pigment2, c1,c2){
    // pigment IS ARRAY OF KS VALUES 
    // TODO could hard code pigment legth to 11 as we know that is true
    let K_mix = new Array( pigment1.length );
    let S_mix = new Array( pigment1.length );
    let R_mix_prime = new Array( pigment1.length );

    let R_mix_tmp = 0.0;
    let tmp = 0.0;

    let pigment_new = new Array( pigment1.length );
    // TODO - redo the math DONT NEED TO KEEP AS ARRAYS ?? CAN COLAPS TO A NUMBER ?
    // TODO find equation mathimaticly equcilent to this for loop
    for(let i = 0; i < pigment1.length; i++ ){

        // TODO will need no update K S values of canvas pigment too

        // TODO these dont need to be arrays
        K_mix[i] = pigment1[i][0] * c1 + pigment2[i][0] *c2;
        S_mix[i] = pigment1[i][1] * c1 + pigment2[i][1] *c2;

        pigment_new[i] = [K_mix[i],S_mix[i]]

        tmp = K_mix[i]/S_mix[i];
        R_mix_tmp = 1 + tmp - Math.sqrt(tmp**2 + 2*tmp);
        R_mix_prime[i] = ((1.0-k1)*(1.0-k2)*R_mix_tmp ) / (1.0-(k2*R_mix_tmp));

    }

    // resulting reflectance (simplified equation)
    return [R_mix_prime , pigment_new];
}

function RmixTOXYZ(R_mix_prime){

    // again TODO hard code length as a constant (11)
    let X = 0.0;
    let Y = 0.0;
    let Z = 0.0;

    // integate X Y Z over selected wavelenghts 
    for(let i = 0; i < 11; i++ ){
        X = X + (cieXYZ[i][0] * D65[i] * R_mix_prime[i]);
        Y = Y + (cieXYZ[i][1] * D65[i] * R_mix_prime[i]);
        Z = Z + (cieXYZ[i][2] * D65[i] * R_mix_prime[i]);

    }

    return [X,Y,Z];
}

function XYZToRGB(X,Y,Z, pigment1, pigment2){

    // XYZ to RGB matrix - D65 iluminant matrix 
    let norm_factor = 1 / yD65;
    let RGB = [ 
        norm_factor*(3.2406*X - 1.5372 * Y - 0.4986 * Z),
        norm_factor*(-0.9689 * X + 1.8758 * Y + 0.0415*Z),
        norm_factor*(0.0556*X-0.2040 * Y + 1.0570 * Z)
    ];

    // TODO fix this, the rgb conversion may already be in sRGB ? 
    // gamma correct linear RGB to sRGB 
    function gamma_corection(channel){
        if (channel <= 0.0031308){
            return 12.92 * channel;
        }
        else{
            return 1.055 * (channel ** (1 / 2.4)) - 0.055;
        }
    }
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    RGB = RGB.map(gamma_corection);
    RGB = [Math.round(255*RGB[0]),Math.round(255*RGB[1]),Math.round(255*RGB[2])];
    // convert to 255 display values
    return RGB.map(c => clamp(c, 0, 255));
}


// --------------- DRAW FUNCTIONS --------------------------------------
// dot product
function dot(v1, v2) {
    return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
}

// normalize vector
function normalize(v) {
    const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [v[0] / length, v[1] / length, v[2] / length];
}


function updateNormal(x, y, pushVector, dist,  radius , strength = 0.01) {

    const scale = strength * (1 - dist / radius);
    
    // *IMPORTANT* TODO fix type error here (cannot read noramlmap of type 0) prob causeing weird normal behavoure
    // push the normal in pusVector direction and weight by distance 
    normalMap[x][y] = [
        normalMap[x][y][0] + pushVector[0] * Math.abs(scale),
        normalMap[x][y][1] + pushVector[1] * Math.abs(scale),
        normalMap[x][y][2] + pushVector[2] * Math.abs(scale)
    ];

    normalMap[x][y] = normalize(normalMap[x][y]);

}


function SpecularBlinnPhong(N, L, V) {

    N = normalize(N);
    L = normalize(L);
    // veiw is passed by value - always normalized as 0,0,1

    // halfway vector H -half way between light and view vectors
    const H = normalize([
        L[0] + V[0],
        L[1] + V[1],
        L[2] + V[2]
    ]);

    // specular intensity 
    const NdotH = Math.max(0.0,dot(N, H));
    // specular color, lightintensity, shininess
    const I_spec = 1.0 * 0.5 * Math.max(0,Math.pow(NdotH, 2.0));
    return I_spec;
}

// Bresenham line algorithem 
function drawLine(rgbaArray, canvasWidth, canvasHight, x0, y0, x1, y1, lineWidth, brushRGB, brushOpacity) {

    // change in x
    let dx = Math.abs(x1 - x0);
    // change in y
    let dy = Math.abs(y1 - y0);
    // sx,sy are step values ie wich direction should we move 
    let sx = (x0 < x1) ? 1 : -1;
    let sy = (y0 < y1) ? 1 : -1;
    let err = dx - dy;


    // gets index for a (x, y) coordinate in the 1D RGBA array
    function getIndex(x, y) {
        // each pixel is 4 values (RGBA) in the array
        return (y * canvasWidth + x) * 4; 
    }


    function setPixel(x, y, alpha) {
        if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
            // concentration should never be more then half for thick paint ?
            let rgb = colorMix(brushPigment, pigment[x][y], alpha, x, y);
            return rgb;

            // lerp mixing 
            //const index = getIndex(x, y);
            //rgbaArray[index] = Math.min(255, (((1-alpha) * rgbaArray[index]) + (alpha * brushRGB[0])));       // red
            //rgbaArray[index + 1] = Math.min(255, (((1-alpha) * rgbaArray[index+1]) + (alpha * brushRGB[1])));   // green
            //rgbaArray[index + 2] = Math.min(255, (((1-alpha) * rgbaArray[index+2]) + (alpha * brushRGB[2])));   // blue 
            //rgbaArray[index + 3] = 255; // Fully opaque
        }
    }

    while (true) {
        // cirle around the main line controled by 
        // iterate through each pixel in area -linewidth to linewidth from pixel x,y
        for (let dxOffset = -lineWidth; dxOffset <= lineWidth; dxOffset++) {
            for (let dyOffset = -lineWidth; dyOffset <= lineWidth; dyOffset++) {

                // straigt line distance from current pixel to center pixel 
                // dxOffset = x - linewidth so no need for (x2-x1) part of the formula
                // TODO do dist <= lineWidth**2 for efficency / check that its right
                let dist = Math.sqrt(dxOffset * dxOffset + dyOffset * dyOffset);
                
                // if the distance is less then the linewidth
                if (dist <= lineWidth) {
                // calculate alpha (mostly 0, close to 1 nearer the linewidth)
                    let alpha = Math.max(0, 1 - dist / lineWidth); 
                    let x = x0 + dxOffset;
                    let y = y0 + dyOffset;
                    
                    // update pixel and normal
                    let pushVector = [dxOffset-x0 / dist,dyOffset-y0/dist, 0.0];
                    rgb = setPixel(x, y, alpha*brushOpacity);
                    updateNormal(x, y , pushVector ,dist , lineWidth)


                    // normal dot light vector / precent of light bouncing off surface
                    // if light is positive - highlight 
                    // if light is negative - shadow
                    let lightType = dot(normalMap[x][y], lightVector);
                    
                    // specular intensity
                    let I_spec = Math.max(0,SpecularBlinnPhong(normalMap[x][y], lightVector, [0.0,0.0,1.0] ))
                    // diffuse color are the rgb values so not in this equation, light intensity = 1 so also leave out
                    let I_diffuse = 0.5 * Math.max(0,lightType);
                    

                    index = getIndex(x ,y);

                    // UPDATE PIXELS with new color , diffuse and specular
                    rgbaArray[index] = (rgb[0] * I_diffuse) + (I_spec);
                    rgbaArray[index + 1] = (rgb[1] * I_diffuse)+ (I_spec);
                    rgbaArray[index + 2] = (rgb[2] * I_diffuse) + (I_spec);
                    rgbaArray[index + 3] = 255;
                    
                    // -- DEBUG -- visulize normal map 
                    //rgbaArray[index] = 255 *  (0.5 + (0.5*normalMap[x][y][0]));
                    //rgbaArray[index + 1] = 255 *  (0.5 + (0.5*normalMap[x][y][1]));
                    //rgbaArray[index + 2] = 255 *  (0.5 + (0.5*normalMap[x][y][2]));
                }
            }
        }
        
        // update normal of x0 and y0 to be straight up:
        normalMap[x0][y0] = [0.0,0.0,5.0];

        // stop at endpoint
        if (x0 === x1 && y0 === y1){
            // update normal of x1 and y1 to be straight up:
            normalMap[x1][y1] = [0.0,0.0,5.0];
            break;
        } 
        
        // caculate decision variable 
        let d = 2 * err;

        if (d > -dy) {
        err -= dy;
        x0 += sx;
        }
        if (d < dx) {
        err += dx;
        y0 += sy;
        }

        // set brushpigment as the last pigment on canvas at curent brush origen
        if (pigment[x0][y0] != false){
            brushPigment = pigment[x0][y0];
        }

    }

}

// ------------------TEST DRAW --------------------------------------
/*
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
const pixelArray = imageData.data;

drawLine(pixelArray, canvas.width, canvas.height, 600,600,200,400, 20, brushRGB, brushOpacity);

ctx.putImageData(imageData,0,0);
*/

// ------------ WORKER THREADS --------------------------

// TODO add multiThreading for preformance with js workers 

// -------------- HELPER FUNCTIONS -----------------------------

// sets painting true on mouse down
function startDraw(e){
    painting = true;
    draw(e);
}

// sets painting false on mouse up
function endDraw(){
    painting = false;
}

canvas.addEventListener("pointerdown", (e) => {

    updateBrushSize(e); // Update brush size based on pressure
    painting = true; // Start drawing
    startDraw(e); // Your start draw logic
});

canvas.addEventListener("pointerup", (e) => {
    painting = false; // Stop drawing
    endDraw(); // Your end draw logic
});

canvas.addEventListener("pointermove", function(e) {

    // Only execute if there's a change in position
    prevX = X;
    prevY = Y;

    X = Math.round(e.clientX);
    Y = Math.round(e.clientY);

    updateBrushSize(e); // Update brush size based on pressure
    if (!painting) return; // Do nothing if not painting
    
        // Draw the line only if the pointer moves
        //console.log("Pointer move:", e.clientX, e.clientY); // Log the movement

        // Perform drawing logic
        draw(); 

});

// pick canvas pigment with 'c' shortcut
document.addEventListener('keydown', (e) => {
    if (e.key === 'c'){
        if (pigment[ X - canvas.offsetLeft][ Y - canvas.offsetTop]==false){

        }else{
            brushPigment = pigment[ X - canvas.offsetLeft][ Y - canvas.offsetTop].slice()

        }
    }
});

canvas.addEventListener("pointerleave", () => {
    painting = false; // Stop drawing
    endDraw();
});


// TODO only draw if the pen is down - rn drawing if the pen is just moving 
function draw(e) {
    if (painting){

        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let pixelArray = imageData.data;

        drawLine(pixelArray, canvas.width, canvas.height, X - canvas.offsetLeft, Y - canvas.offsetTop, prevX - canvas.offsetLeft, prevY - canvas.offsetTop, Math.round(brushSize), brushRGB, brushOpacity);

        ctx.putImageData(imageData, 0, 0);
    }
}

function hexToRGB(hexString){

    const r = parseInt(hexString.slice(1,3),16);
    const g = parseInt(hexString.slice(3,5),16);
    const b = parseInt(hexString.slice(5,7),16);

    return [r,g,b];
}

document.getElementById('btnWhite').addEventListener('click', () => {
    brushPigment = initalPigments[0]; 
});

document.getElementById('btnRed').addEventListener('click', () => {
    brushPigment = initalPigments[1]; 
});

document.getElementById('btnBlue').addEventListener('click', () => {
    brushPigment = initalPigments[2]; 
});

document.getElementById('btnYellow').addEventListener('click', () => {
    brushPigment = initalPigments[3]; 
});

// prevents touch events when using windows ink:
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();  
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    e.stopPropagation();  
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();  
}, { passive: false });


// ---------------BRUSH ENGINE---------------------

function updateBrushSize(e){

    brushSize = Math.max(1, Math.min(baseBrushSize, 100*e.pressure)); 

    // use a power function to make this feel better?
    // TODO make a slide to adjust presure multiplyer 
    brushOpacity = e.pressure*0.25; 

}

/*
class Brush{
    constructor(){
        
    }

    // we want this texture to not change as we are drawing
    // solution: generate 1 time, then resize it?

    texture(x,y){
        
        // make texture brush size in diamatere
        let texture = Array.from({ length: this.size }, () => new Array(this.size));
        // spawn dots in brush area 
        // gen size*size random num 0 or 1 
        // TODO control density of dots + size of dots 
        for(let i = 0; i < this.size; i++) {
            for(let j = 0; j < this.size; j++){
                texture[i][j] = Math.round(Math.random());
            }
        }

        return texture;
    }

}
*/
