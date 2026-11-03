param([Parameter(Mandatory=$true)][string]$Profile,[Parameter(Mandatory=$true)][string]$Title)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$resolved=[IO.Path]::GetFullPath($Profile)
if([IO.Path]::GetDirectoryName($resolved) -ne $root -or [IO.Path]::GetFileName($resolved) -notmatch '^ogh-native-qa-[a-zA-Z0-9]+$' -or $Title -notmatch '^OGH QA (A|B|ADMIN) [a-f0-9]{12}$'){exit 2}
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class QaFocus {
 public delegate bool EnumProc(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc c,IntPtr p);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int n);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
 [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a,uint b,bool attach);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 public static IntPtr Find(uint[] ids,string title) {
  IntPtr found=IntPtr.Zero; int matches=0;
  EnumWindows((h,p)=>{ uint id;GetWindowThreadProcessId(h,out id);var s=new StringBuilder(512);GetWindowText(h,s,512);
   if(Array.IndexOf(ids,id)>=0 && IsWindowVisible(h) && s.ToString().StartsWith(title+" - ",StringComparison.Ordinal)) { found=h;matches++; } return true;},IntPtr.Zero);
  return matches==1?found:IntPtr.Zero;
 }
 public static bool Focus(IntPtr h) {
  if(h==IntPtr.Zero)return false;uint ignored;uint foreground=GetWindowThreadProcessId(GetForegroundWindow(),out ignored);
  uint current=GetCurrentThreadId();bool linked=foreground!=0&&foreground!=current&&AttachThreadInput(current,foreground,true);
  try{ShowWindow(h,9);BringWindowToTop(h);SetForegroundWindow(h);}finally{if(linked)AttachThreadInput(current,foreground,false);}
  return GetForegroundWindow()==h&&IsWindowVisible(h)&&!IsIconic(h);
 }
}
'@
[Console]::Out.WriteLine('READY')
while($null -ne ($line=[Console]::In.ReadLine())) {
 if($line -eq 'EXIT'){break}
 if($line -ne 'FOCUS'){[Console]::Out.WriteLine('INVALID');continue}
 try {
  $ids=@(Get-CimInstance Win32_Process -Filter "name='chrome.exe'" | Where-Object {$_.ExecutablePath -eq 'C:\Program Files\Google\Chrome\Application\chrome.exe' -and $_.CommandLine -and $_.CommandLine.Contains('--user-data-dir='+$resolved)} | ForEach-Object {[uint32]$_.ProcessId})
  $window=[QaFocus]::Find([uint32[]]$ids,$Title)
  if([QaFocus]::Focus($window)){[Console]::Out.WriteLine('FOCUSED')}else{[Console]::Out.WriteLine('UNAVAILABLE')}
 }catch{[Console]::Out.WriteLine('UNAVAILABLE')}
}
