// 莺空社区. Default RENDER endpoint peak meter only. No capture device, PCM or recording.
using System;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
 [PreserveSig] int EnumAudioEndpoints(int flow, uint mask, out IntPtr devices);
 [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
 [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
 [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr client);
 [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr client);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
 [PreserveSig] int Activate(ref Guid iid,uint context,IntPtr parameters,[MarshalAs(UnmanagedType.IUnknown)]out object value);
 [PreserveSig] int OpenPropertyStore(int mode,out IntPtr properties);
 [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)]out string id);
 [PreserveSig] int GetState(out uint state);
}
[ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioMeterInformation {
 [PreserveSig] int GetPeakValue(out float peak);
 [PreserveSig] int GetMeteringChannelCount(out uint count);
 [PreserveSig] int GetChannelsPeakValues(uint count,IntPtr values);
 [PreserveSig] int QueryHardwareSupport(out uint support);
}
class SystemAudioMeter {
 static volatile bool stopping;
 static void Release(object value){if(value!=null&&Marshal.IsComObject(value))Marshal.ReleaseComObject(value);}
 static void Check(int hr){Marshal.ThrowExceptionForHR(hr);}
 [STAThread] static int Main(){
  var input=new Thread(()=>{try{while(true){string line=Console.ReadLine();if(line==null||line=="stop")break;}}catch{}finally{stopping=true;}});input.IsBackground=true;input.Start();
  IMMDeviceEnumerator enumerator=null;IMMDevice device=null;IAudioMeterInformation meter=null;
  string id=null;int revision=0;DateTime next=DateTime.MinValue;
  try{
   while(!stopping){
    float peak=0;bool available=false;
    try{
     if(DateTime.UtcNow>=next){
      next=DateTime.UtcNow.AddSeconds(1);
      if(enumerator==null)enumerator=(IMMDeviceEnumerator)new MMDeviceEnumerator();
      IMMDevice candidate=null;
      try{
       // eRender=0, eMultimedia=1. Never eCapture.
       Check(enumerator.GetDefaultAudioEndpoint(0,1,out candidate));
       string current;Check(candidate.GetId(out current));
       if(current!=id||meter==null){
        Release(meter);meter=null;Release(device);device=null;id=null;
        Guid iid=typeof(IAudioMeterInformation).GUID;object value;
        Check(candidate.Activate(ref iid,1,IntPtr.Zero,out value));
        meter=(IAudioMeterInformation)value;device=candidate;candidate=null;id=current;revision++;
       }
      }finally{Release(candidate);}
     }
     if(meter!=null){Check(meter.GetPeakValue(out peak));available=!float.IsNaN(peak)&&!float.IsInfinity(peak);}
    }catch{Release(meter);meter=null;Release(device);device=null;id=null;next=DateTime.UtcNow.AddSeconds(1);}
    try{Console.WriteLine("{\"v\":1,\"available\":"+(available?"true":"false")+",\"peak\":"+Math.Max(0,Math.Min(1,peak)).ToString("0.00000",CultureInfo.InvariantCulture)+",\"deviceRevision\":"+revision+"}");}catch{break;}
    Thread.Sleep(200);
   }
  }finally{Release(meter);Release(device);Release(enumerator);}
  return 0;
 }
}
