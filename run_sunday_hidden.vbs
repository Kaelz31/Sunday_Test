Set objShell = CreateObject("WScript.Shell")

' Path to your Python executable inside the venv
pythonPath = """C:\Sunday_Test\venv\Scripts\python.exe"""

' Path to Sunday’s app.py
appPath = """C:\Sunday_Test\app.py"""

' Set the model environment variable before running
cmd = "cmd /c set MODEL=llama3.2-vision:11b && " & pythonPath & " " & appPath

' Run hidden (0 = hidden window, False = don’t wait for it to finish)
objShell.Run cmd, 0, False