[Setup]
AppName=KidFaster
AppVersion=2.0
AppPublisher=Kido
DefaultDirName={userappdata}\Adobe\CEP\extensions\KidFaster
DefaultGroupName=KidFaster
OutputBaseFilename=KidFaster_Setup
OutputDir=.\
Compression=lzma2
SolidCompression=yes
DisableProgramGroupPage=yes
; We only need lowest privileges since we install to AppData and HKCU
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayIcon={app}\KidFaster_Setup.exe

[Files]
; Pulls everything from the built dist folder and bundles it into the exe
Source: "dist\KidFaster\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
; Enable CEP PlayerDebugMode for all versions of After Effects (CSXS.9 to CSXS.16)
Root: HKCU; Subkey: "Software\Adobe\CSXS.9"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.10"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.11"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.12"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.13"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.14"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.15"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.16"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"; Flags: uninsdeletevalue

[Code]
// Helper function to check if a specific process is currently running
function IsAppRunning(const FileName: string): Boolean;
var
  FSWbemLocator: Variant;
  FWMIService: Variant;
  FWbemObjectSet: Variant;
begin
  Result := False;
  try
    FSWbemLocator := CreateOleObject('WbemScripting.SWbemLocator');
    FWMIService := FSWbemLocator.ConnectServer('', 'root\CIMV2', '', '');
    FWbemObjectSet := FWMIService.ExecQuery(Format('SELECT Name FROM Win32_Process Where Name="%s"', [FileName]));
    Result := (FWbemObjectSet.Count > 0);
  except
    // If WMI fails for any reason, safely assume false so installation isn't permanently blocked
    Result := False;
  end;
end;

// Hook into setup initialization to check for After Effects
function InitializeSetup(): Boolean;
begin
  Result := True;
  
  if IsAppRunning('AfterFX.exe') then
  begin
    MsgBox('Adobe After Effects is currently running.' + #13#10#13#10 +
           'Please close After Effects completely before installing KidFaster.',
           mbError, MB_OK);
    Result := False;
  end;
end;
