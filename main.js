'use strict';

/*
  shim requestAnimationFrame api
  source: http://www.paulirish.com/2011/requestanimationframe-for-smart-animating/
*/
 var requestAnimFrame =
  window.requestAnimationFrame       ||
  window.webkitRequestAnimationFrame ||
  window.mozRequestAnimationFrame    ||
  window.oRequestAnimationFrame      ||
  window.msRequestAnimationFrame     ||
  function(callback) {
    window.setTimeout(callback, 1000 / 60);
  };

/*
  shim getUserMedia with a Promise api
  source: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
*/
function getUserMedia(constraints, successCallback, errorCallback) {
  // First get a hold of getUserMedia, if present
  var getUserMedia = (navigator.getUserMedia ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia);

  // Some browsers just don't implement it - return a rejected promise with an error
  // to keep a consistent interface
  if(!getUserMedia) {
    return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
  }

  // Otherwise, wrap the call to the old navigator.getUserMedia with a Promise
  return new Promise(function(successCallback, errorCallback) {
    getUserMedia.call(navigator, constraints, successCallback, errorCallback);
  });

}

// Older browsers might not implement mediaDevices at all, so we set an empty object first
if(navigator.mediaDevices === undefined) {
  navigator.mediaDevices = {};
}

// Some browsers partially implement mediaDevices. We can't just assign an object
// with getUserMedia as it would overwrite existing properties.
// Here, we will just add the getUserMedia property if it's missing.
if(navigator.mediaDevices.getUserMedia === undefined) {
  navigator.mediaDevices.getUserMedia = getUserMedia;
}

/*
  Utility for getting dom references
  return DOM Object
*/
function $(selector) {
  return document.querySelector(selector);
}

/*
  utility function to log only once
*/
function createLogOnce() {
  var counter = 0;
  return function logOnce() {
    if(counter < 1) {
      console
        .log
        .apply(console, arguments);
    }
    counter ++;
  }
}

/*
  logger instances
*/
var logOnce_1 = createLogOnce();
var logOnce_2 = createLogOnce();
var logOnce_3 = createLogOnce();

/*
  constraints object for getUserMedia
*/
var constraints = {
  audio: false,
  video: true
};

/*
  last captured imageData
*/
var currentImageData;
/*
  previous captured imageData
*/
var previousImageData;

/*
  debug image container
*/
var container = $('#container');

/*
  toggle raw and blend video
*/
var toggleBtn = $('#toggle');

/*
  video element rendering raw camera input
*/
var rawVideo = $('#raw-video');

/*
  canvas element rendering raw camera input
*/
var rawCanvas = $('#raw-canvas');

/*
  context for raw image
*/
var rawCtx = rawCanvas.getContext('2d');

/*
  canvas containing the grid
*/
var gridCanvas = $('#grid-canvas');

/*
  grid canvas context
*/
var gridCtx = gridCanvas.getContext('2d');

/*
  width of grid canvas
*/
var gridWidth = gridCanvas.width;

/*
  height of grid canvas
*/
var gridHeight = gridCanvas.height;

/*
  canvas element rendering blend image
*/
var blendCanvas = $('#blend-canvas');

/*
  blend canvas 2d context
*/
var blendCtx = blendCanvas.getContext('2d');

/*
  width of blend canvas
*/
var blendWidth = blendCanvas.width;

/*
  height of blend canvas
*/
var blendHeight = blendCanvas.height;

/*
  blend imageData
*/
var blendImageData = blendCtx.getImageData(0, 0, blendWidth, blendHeight);

/*
  is Worker available?
*/
var isWorkerAvailable = 'Worker' in window;

/*
  Worker
*/
var differ = new Worker('differ.js');

/*
  Save a reference to Math.PI
*/
var PI = Math.PI;

/*
  grid image resolution values
*/
var GRID_RESOLUTION_X = 8;
var GRID_RESOLUTION_Y = 8;

/*
  grid cell resolution
*/
var CELL_WIDTH = gridWidth / GRID_RESOLUTION_X;
var CELL_HEIGHT = gridHeight / GRID_RESOLUTION_Y;


/*
  toggle the raw videos. callback for `toggleBtn` click
*/
function toggle(event) {
  event.preventDefault
  if(container.classList.contains('hidden')) {
    container.classList.remove('hidden');
    toggleBtn.textContent = '-';
  } else {
    container.classList.add('hidden');
    toggleBtn.textContent = '+';
  }

}


/*
  draws stream into a output element (video or canvas)
  returns output
*/
function pipe(input, output) {
  /*TODO pipe needs to take in  function. refactor the api */
  if(typeof input === 'string' && typeof output === 'object') {
    // piping blob to video element
    output.src = input;
  } else if(typeof input === 'object' && typeof output === 'object') {
    // piping video to canvas
    output
      .getContext('2d')
      .drawImage(input, 0, 0, output.width, output.height);
  }

  return output;
}

/*
  hirozintally mirror canvas
  returns canvas
*/
function mirror(canvas) {
  var ctx = canvas.getContext('2d');
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  return canvas;
}

/*
  compare input and output average values
  returns ?
*/
function compare(input1, input2) {
  var length = input1.length;
  var data1 = input1.data;
  var data2 = input2.data
  var buffer = new ArrayBuffer(data1.length);

  differ.postMessage({
    buffer: buffer,
    data1: data1,
    data2: data2,
    sensitivity: 0.5,
    width: blendWidth,
    height: blendHeight
  });
}

/*
  blend two consecutive frames
  returns imageData
*/
function blend(input, output) {
  var inputCtx = input.getContext('2d');
  var outputCtx = output.getContext('2d');
  var width = input.width;
  var height = input.height;
  currentImageData = inputCtx.getImageData(0, 0, width, height);
  previousImageData = previousImageData || inputCtx.getImageData(0, 0, width, height);
  compare(currentImageData, previousImageData);
}

/*
  create a matrix
*/
function matrix() {
  var matrix = [];
  var i;
  var j;
  var posX;
  var posY;
  var k = 0;
  var cellWidth = blendWidth / GRID_RESOLUTION_X;
  var cellHeight = blendHeight / GRID_RESOLUTION_Y
  var cellImageData;
  var cellImageDataLength;
  var cellPixelCount;
  var average = 0;

  for(i = 0; i < blendWidth; i += cellWidth) {
    var row = [];
    for(j = 0; j < blendHeight; j += cellHeight) {
      cellImageData = blendCtx.getImageData(i, j, cellWidth, cellHeight).data;
      /*TODO refactor with bitshifting */
      cellImageDataLength = cellImageData.length;
      cellPixelCount = cellImageDataLength / 4;
      while(k < cellPixelCount) {
        average += (cellImageData[k * 4] + cellImageData[k * 4 + 1] + cellImageData[k * 4 + 2]) / 3;
        ++k;
      }
      average = round(average / cellPixelCount);
      /* push the value in the row */
      row.push(average  );
      average = 0;
      k = 0;
    }
    matrix.push(row); // store the row in matrix
  }

  return matrix;
}

/*
  draw a matrix as hit points
*/
function drawGrid(matrix) {
  var imageData;
  for(var i = 0; i < matrix.length; i += 1) {
    var row = matrix[i];
    for(var j = 0; j < row.length; j += 1) {
      var column = row[j];
      imageData = rawCtx.getImageData(0, 0, CELL_WIDTH, CELL_HEIGHT);
      if(column < 250) {
        gridCtx.putImageData(imageData, i * CELL_WIDTH, j * CELL_HEIGHT);
      }
    }

  }

}

/*
  draw a matrix as hit points
*/
// function drawGrid(matrix) {
//   var fill;
//   for(var i = 0; i < matrix.length; i += 1) {
//     var row = matrix[i];
//     for(var j = 0; j < row.length; j += 1) {
//       var column = row[j];
//       gridCtx.beginPath();
//       fill = column > 127 ? 255 : 0;
//       // gridCtx.fillStyle = 'rgb(' + fill + ',' + fill + ',' + fill + ')';
//       gridCtx.fillStyle = 'rgb(' + fill + ',' + fill + ',' + column + ')';
//       //gridCtx.arc(i * CELL_WIDTH, j * CELL_HEIGHT, CELL_WIDTH, 0, 2 * PI, false);
//       //gridCtx.fill();
//
//       gridCtx.fillRect(i * CELL_WIDTH, j * CELL_HEIGHT, CELL_WIDTH, CELL_HEIGHT);
//       gridCtx.closePath();
//     }
//
//   }
//
// }


/*
  bitwise Math.round
  returns number
*/
function round(number) {
  return (number + .5) >> 0;
}

/*
  worker message event callback
  draws pixel buffer to blend canvas
*/
function drawBlendImage(messageEvent) {
  logOnce_1('main thread - ', messageEvent.data);
  blendImageData
    .data
    .set(
      new Uint8ClampedArray(messageEvent.data)
    );

  blendCtx.putImageData(blendImageData, 0, 0);
  previousImageData = currentImageData;
}

/*
  iteratively calculate and draw
  returns undefined
*/
function loop() {
  pipe(rawVideo, rawCanvas);
  blend(rawCanvas, blendCanvas);
  drawGrid(matrix());

  requestAnimFrame(loop);
}

/*
  kickstart the process
*/
getUserMedia(constraints)
  .then(
    function(stream) {
      // order is important
      var input = window.URL.createObjectURL(stream);
      differ.addEventListener('message', drawBlendImage);
      toggleBtn.addEventListener('click', toggle);
      [rawCanvas, blendCanvas].forEach(mirror);
      pipe(input, rawVideo);
      loop();

    }
  )
  .catch(
    function(error) {
      console.error('Failed to draw camera input to video ', error);
    }
  );
