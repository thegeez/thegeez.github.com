const appUri = "fecs.wasm";

var log = function () {};

var wasm_app;
var global_wasm_memory;

const utf8dec = new TextDecoder("utf8");
const utf8enc = new TextEncoder();

var outstream_write_fn = function(bytesArr) {};
var outstream_close_fn = function() {};

function outstreamWrite(len) {
   const start = 0xA00;
   const memory = new Uint8Array(global_wasm_memory.buffer);
   const bytesArr = memory.slice(start, start + len); // reuse buffer with memory.subarray(start, start + len)
   outstream_write_fn(bytesArr);
}
function outstreamClose() {
   outstream_close_fn();
}
async function ReloadWasm() {
    try {
      log("(Re)loading wasm")
      let response = await fetch(appUri, { cache: "no-cache" });
          const wasm_memory = new WebAssembly.Memory({ initial: 1,
                                                       maximum: 1
                                                     });
        var importObject = {"env": {"memory": wasm_memory,
                                    "outstreamWrite": outstreamWrite
                                    } };
        newApp = await WebAssembly.instantiateStreaming(response, importObject);
        wasm_app = newApp.instance;
        global_wasm_memory = wasm_memory;
        log("global_wasm_memory", global_wasm_memory);
        wasm_app.exports.initVM();
      } catch (error) {
        console.error("failed to install new App", { error })
     }
  }
async function LoadWasm(origin_caller) {
   log("LoadWasm due to ", origin_caller);
   if (wasm_app) {
      log("wasm_app already loaded", wasm_app);
      return;
   } else {
      log("wasm_app not yet loaded", wasm_app);
   }
   await ReloadWasm();
}

self.addEventListener("install", (event) => {
  log("Received service worker lifecycle event: install");
  event.waitUntil(LoadWasm("install"));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  log("Received service worker lifecycle event: activate");
  event.waitUntil(LoadWasm("activate"));
  event.waitUntil(clients.claim());
});

// Check for a new app when a new client loads
self.addEventListener('message', (event) => {
  if (event.data.type === 'clientattached') {
    log("Received message", { type: event.data.type, event });
    event.waitUntil(LoadWasm("clientattached"));
  }
  if (event.data.type === 'wasmreloadreq') {
      event.waitUntil(ReloadWasm());
  }
  if (event.data.type === 'enableLog') {
      log = function() {
         console.log.apply(console.log, arguments);
      }
  }
});


function fecsStr(m32, ptr) {
      if((ptr & 2) != 2) {
         return "NOTASTRTOPRINT";
      }
       var head = (ptr - 2);
       var decoder = new TextDecoder();
       var out_chars = [];
       var STOP = 0;
       while (1) { // && STOP++ < 4){
           var at_val = m32[head / 4];
                 var chars = new ArrayBuffer(4);
                 var view_chars = new DataView(chars);
                 view_chars.setUint32(0, at_val, true);
                 for (i = 0; i < 4; i++) {
                  var c = view_chars.getUint8(i);
                  if (c == 0) {
                      break;
                  }
                  out_chars.push(c);
                  if (i == 3) {
                      break;
                  }
              }
              head = m32[(head / 4) + 1];
              if (head == 0x414) {
                  break;
              }
              head = head - 2;

          }
          return decoder.decode(new Uint8Array(out_chars).buffer);
      }

async function fetchMulti(event) {
  try {
   const url = event.request.url;

   const body = await event.request.text();
      const str_in = body;
      const encoder = new TextEncoder();
      const str_in_bytes = encoder.encode(str_in);
      // cap max bytes copied to input buffer length at 4096
      const str_in_bytes_length = str_in_bytes.length;
      const nonFullBatch = str_in_bytes_length < 4096;
      const buf_length = nonFullBatch ? str_in_bytes_length + 1 : 4096;
      var bb_ptr = wasm_app.exports.fecs_ioInBufferStart();
   log("wasm_app", wasm_app);
      var bb_chars = new Uint8Array(global_wasm_memory.buffer, bb_ptr, buf_length);
      bb_chars.set(str_in_bytes.slice(0, str_in_bytes_length));
      // final batch is not a full buffer
      if (nonFullBatch) {
         bb_chars[buf_length - 1] = 0;
         log("sw added 0 end",bb_chars[buf_length - 1]);
         }
      log("bb_ptr");
      log(bb_ptr);

      const responseStream = new ReadableStream({
         start(controller) {

         outstream_write_fn = function(bytesArr) {
            controller.enqueue(bytesArr);
         }
         outstream_close_fn = function() {
            controller.close();
            outstream_write_fn = function() {};
            outstream_close_fn = function() {};
         }
         }
      });

      var result_pointer = wasm_app.exports.readEvalInMulti();
      if (str_in_bytes_length == 4096) {
         log("Multi expects more calls");
         outstream_close_fn();
         return new Response(responseStream, {
           headers: { "Content-Type": "text/html" },
         });
      }
         log("result_pointer");
         log(result_pointer);

         var out_pointer = wasm_app.exports.fecs_print(result_pointer);
         log("out_pointer");
         log(out_pointer);

         const m32 = new Uint32Array(global_wasm_memory.buffer);
         var out_string = fecsStr(m32, out_pointer);
         log("OUT", out_string);

         wasm_app.exports.fecs_flush();
         outstream_write_fn(encoder.encode("-> "));
         outstream_write_fn(encoder.encode(out_string));
         outstreamClose();
      log("wasm app after", wasm_app);
      return new Response(responseStream, {
        headers: { "Content-Type": "text/html" },
      });
    } catch (error) {
      console.error("error querying wasm app for result", { error, event });
      outstream_write_fn = function() {};
      outstream_close_fn = function() {};
    }
  }

self.addEventListener("fetch", (event) => {
  log("Fetch listener");
  let url = new URL(event.request.url);

  let shouldOverride = url.origin === event.target.location.origin
    && !url.pathname.endsWith("repl.html")
    && !url.pathname.endsWith("repl2.html")
    && !url.pathname.endsWith("test_readprint.html")
    && !url.pathname.endsWith("test_eval.html")
    && !url.pathname.endsWith("favicon.ico")
    && !url.pathname.endsWith("sw.js")
    && !url.pathname.endsWith("sw2.js")
    && !url.pathname.endsWith("fecs.wasm");

  if (!shouldOverride) {
    return; // fall back to browser default fetch handling
  }

  event.respondWith((async () => {
   const url = event.request.url;
   if (url.endsWith("Multi")) {
      return await fetchMulti(event);
   }
    try {

   const body = await event.request.text();
   log("Sending fetch to wasm parseIn" , wasm_app);
      const str_in = body;
      const encoder = new TextEncoder();
      const str_in_bytes = encoder.encode(str_in);
      const str_in_bytes_length = str_in_bytes.length;
      var bb_ptr = wasm_app.exports.fecs_ioInBufferStart();
      var bb_chars = new Uint8Array(global_wasm_memory.buffer, bb_ptr, str_in_bytes_length + 1);
      bb_chars.set(str_in_bytes);
      bb_chars[str_in_bytes_length] = 0;

      log("bb_ptr");
      log(bb_ptr);

      const responseStream = new ReadableStream({
         start(controller) {
         outstream_write_fn = function(bytesArr) {
            controller.enqueue(bytesArr);
         }
         outstream_close_fn = function() {
            controller.close();
            outstream_write_fn = function() {};
            outstream_close_fn = function() {};
         }
         }
      });

      log("pre data_pointer", url.endsWith("Multi"), url);
      var data_pointer =  wasm_app.exports.parseIn();

      log("data_pointer");
      log(data_pointer);
                  if (data_pointer & 1) {
                     
                     log("Parse not done");
                     log(data_pointer);
                     return;
                  }
         var result_pointer = wasm_app.exports.fecs_eval(data_pointer);
         log("result_pointer");
         log(result_pointer);

         wasm_app.exports.fecs_flush();
         outstreamClose();

         var out_pointer = wasm_app.exports.fecs_print(result_pointer);
         log("out_pointer");
         log(out_pointer);

         const m32 = new Uint32Array(global_wasm_memory.buffer);
         var out_string = fecsStr(m32, out_pointer);
         log("OUT", out_string);
      return new Response(responseStream, {
        headers: { "Content-Type": "text/html" },
      });
    } catch (error) {
      console.error("error querying wasm app for result", { error, event });
      outstream_write_fn = function() {};
      outstream_close_fn = function() {};
    }
  })());
});

