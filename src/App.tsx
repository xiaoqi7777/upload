import React, { useState } from 'react';
import {request} from './utils'
import Upload from './Upload'
function App() {
  let  [number,setNumber]=useState<number>(0)
  async function btn(){
   let rs = await request({
     url:'/test/123?a=1'
   })
   setNumber(1)
   console.log('rs',rs)
  }
  return (
    <div className="App">
      <button onClick={btn}>接口测试</button>
      app=> {number}

      <br/>
      <Upload/>
    </div>
  );
}
export default App;
